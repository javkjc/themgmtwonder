import math
import logging
import numpy as np
import cv2

logger = logging.getLogger(__name__)

QUALITY_THRESHOLD = 50.0


def correct_orientation(img: np.ndarray) -> np.ndarray:
    """Detect rotation using image moments and correct to upright."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    coords = np.column_stack(np.where(thresh > 0))
    if len(coords) < 10:
        return img
    angle = cv2.minAreaRect(coords)[-1]
    # minAreaRect returns angle in [-90, 0); normalise to nearest 90-degree rotation
    if angle < -45:
        angle = 90 + angle
    # Only correct obvious 90/180/270 degree rotations detected via moments
    M = cv2.moments(thresh)
    if M["m00"] == 0:
        return img
    mu20 = M["mu20"] / M["m00"]
    mu02 = M["mu02"] / M["m00"]
    mu11 = M["mu11"] / M["m00"]
    # Orientation angle via second-order central moments
    theta = 0.5 * math.atan2(2 * mu11, mu20 - mu02)
    angle_deg = math.degrees(theta)
    # Snap to nearest 90° rotation
    rotation = round(angle_deg / 90) * 90
    if rotation == 0:
        return img
    h, w = img.shape[:2]
    # Guard: a 90° or 270° rotation on a portrait image (h > w) would swap the
    # long and short axes inside the same canvas, cropping ~50% of the content.
    # Portrait images are almost always already upright — skip 90/270 rotations.
    if abs(rotation) in (90, 270) and h > w:
        return img
    center = (w // 2, h // 2)
    # For 90° rotations expand the canvas to preserve all content
    if abs(rotation) in (90, 270):
        new_w, new_h = h, w
    else:
        new_w, new_h = w, h
    M_rot = cv2.getRotationMatrix2D(center, rotation, 1.0)
    if new_w != w or new_h != h:
        M_rot[0, 2] += (new_w - w) / 2
        M_rot[1, 2] += (new_h - h) / 2
    rotated = cv2.warpAffine(img, M_rot, (new_w, new_h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    logger.info("Orientation correction applied: %.1f degrees", rotation)
    return rotated


def deskew(img: np.ndarray) -> tuple[np.ndarray, float]:
    """Deskew using Hough line transform. Returns (corrected_image, angle_corrected)."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150, apertureSize=3)
    lines = cv2.HoughLines(edges, 1, np.pi / 180, threshold=100)

    if lines is None:
        return img, 0.0

    angles = []
    for line in lines:
        rho, theta = line[0]
        angle = math.degrees(theta) - 90
        # Only use angles in the -45 to +45 range
        if -45 <= angle <= 45:
            angles.append(angle)

    if not angles:
        return img, 0.0

    skew_angle = float(np.median(angles))

    if abs(skew_angle) < 0.1:
        return img, 0.0

    h, w = img.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, skew_angle, 1.0)
    corrected = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    logger.info("Deskew applied: %.2f degrees", skew_angle)
    return corrected, skew_angle


def remove_shadow(img: np.ndarray) -> np.ndarray:
    """Shadow removal using morphological opening to estimate background, divide, normalise.

    Only applied when the image has meaningful uneven illumination (shadow content).
    Skipped for clean digital/screen-captured images where the background already
    matches the original — in those cases, ch/bg ≈ 1.0 everywhere and normalisation
    would destroy the image by compressing all pixels to near-zero.

    Shadow is detected by comparing the 95th-percentile brightness of the estimated
    background against the 5th-percentile brightness of the original. A large gap
    indicates shadow regions that benefit from correction.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    h, w = img.shape[:2]
    # Kernel: large enough to span inter-character gaps but capped at 8% of the
    # smallest dimension so it doesn't dwarf small images.
    min_dim = min(h, w)
    k = max(15, min(51, int(min_dim * 0.08)))
    if k % 2 == 0:
        k += 1
    kernel = np.ones((k, k), np.uint8)

    # Shadow presence check: the divide-and-normalise approach only helps when
    # illumination is uneven (i.e. the estimated background varies significantly
    # across the image). For well-lit images — where ≥70% of pixels are bright
    # (≥180) — the background is already uniform and division maps the majority
    # population to near-zero. Skip in that case.
    bright_fraction = float((gray >= 180).sum()) / float(gray.size)
    if bright_fraction >= 0.70:
        return img

    if len(img.shape) == 2:
        bg = cv2.morphologyEx(img, cv2.MORPH_OPEN, kernel)
        bg = np.where(bg == 0, 1, bg).astype(np.float32)
        divided = img.astype(np.float32) / bg
        normalized = cv2.normalize(divided, None, 0, 255, cv2.NORM_MINMAX)
        return normalized.astype(np.uint8)
    else:
        channels = cv2.split(img)
        result_channels = []
        for ch in channels:
            bg = cv2.morphologyEx(ch, cv2.MORPH_OPEN, kernel)
            bg = np.where(bg == 0, 1, bg).astype(np.float32)
            ch_f = ch.astype(np.float32)
            divided = ch_f / bg
            normalized = cv2.normalize(divided, None, 0, 255, cv2.NORM_MINMAX)
            result_channels.append(normalized.astype(np.uint8))
        return cv2.merge(result_channels)


def enhance_contrast(img: np.ndarray) -> np.ndarray:
    """CLAHE contrast enhancement (clip limit 2.0, tile grid 8x8)."""
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    if len(img.shape) == 2:
        return clahe.apply(img)
    else:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l_eq = clahe.apply(l)
        lab_eq = cv2.merge([l_eq, a, b])
        return cv2.cvtColor(lab_eq, cv2.COLOR_LAB2BGR)


def compute_quality_score(img: np.ndarray) -> float:
    """Compute Laplacian variance as a sharpness proxy."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    return float(lap.var())


def run_pipeline(
    img: np.ndarray,
    steps: list[str],
    quality_threshold: float = QUALITY_THRESHOLD,
) -> dict:
    """
    Run the preprocessing pipeline on the given image.

    Returns a dict with:
      ok: bool
      image: np.ndarray (if ok=True)
      preprocessing_applied: dict
      quality_score: float
      reason: str (if ok=False)
    """
    applied_steps = []
    deskew_angle = 0.0

    if "orientation" in steps:
        img = correct_orientation(img)
        applied_steps.append("orientation")

    if "deskew" in steps:
        img, deskew_angle = deskew(img)
        applied_steps.append("deskew")

    # Quality gate runs after geometric corrections but before normalisation steps
    # (shadow removal and CLAHE can inflate Laplacian variance on uniform blurry images)
    quality_score = compute_quality_score(img)

    if quality_score < quality_threshold:
        return {
            "ok": False,
            "reason": "quality_too_low",
            "quality_score": quality_score,
        }

    if "shadow" in steps:
        img = remove_shadow(img)
        applied_steps.append("shadow")

    if "contrast" in steps:
        img = enhance_contrast(img)
        applied_steps.append("contrast")

    return {
        "ok": True,
        "image": img,
        "preprocessing_applied": {
            "steps": applied_steps,
            "deskewAngle": round(deskew_angle, 4),
            "qualityScore": round(quality_score, 4),
        },
    }
