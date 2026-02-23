import argparse
import json
import os
from datetime import datetime, timezone
from typing import Any, Optional


def run_finetune(
    input_path: str,
    output_root: str,
    candidate_version: str,
    synthetic_path: Optional[str] = None,
    synthetic_ratio: Optional[float] = None,
    epochs: Optional[int] = None,
    batch_size: Optional[int] = None,
    learning_rate: Optional[float] = None,
) -> dict[str, Any]:
    """
    L1 stub.
    L2 will replace this with real LayoutLMv3 training.
    """
    with open(input_path, "r", encoding="utf-8") as handle:
        rows = json.load(handle)
        if not isinstance(rows, list):
            raise ValueError("input export JSON must be an array")

    output_dir = os.path.join(output_root, candidate_version)
    os.makedirs(output_dir, exist_ok=True)

    metrics = {
        "status": "stub",
        "rowCount": len(rows),
        "syntheticPath": synthetic_path,
        "syntheticRatio": synthetic_ratio,
        "epochs": epochs if epochs is not None else 1,
        "batchSize": batch_size if batch_size is not None else 4,
        "learningRate": learning_rate if learning_rate is not None else 5e-5,
        "completedAt": datetime.now(timezone.utc).isoformat(),
    }

    with open(os.path.join(output_dir, "metrics.json"), "w", encoding="utf-8") as handle:
        json.dump(metrics, handle, indent=2)

    with open(os.path.join(output_dir, "config.json"), "w", encoding="utf-8") as handle:
        json.dump({"model": "layoutlmv3", "stub": True}, handle, indent=2)

    return {"metrics": metrics, "modelPath": output_dir}


def main() -> None:
    parser = argparse.ArgumentParser(description="L1 finetune stub")
    parser.add_argument("--input", required=True, dest="input_path")
    parser.add_argument("--output", required=True, dest="output_dir")
    parser.add_argument("--synthetic", default=None, dest="synthetic_path")
    parser.add_argument("--synthetic-ratio", type=float, default=None, dest="synthetic_ratio")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch-size", type=int, default=4, dest="batch_size")
    parser.add_argument("--learning-rate", type=float, default=5e-5, dest="learning_rate")
    args = parser.parse_args()

    candidate_version = os.path.basename(os.path.normpath(args.output_dir))
    output_root = os.path.dirname(os.path.normpath(args.output_dir))
    run_finetune(
        input_path=args.input_path,
        output_root=output_root,
        candidate_version=candidate_version,
        synthetic_path=args.synthetic_path,
        synthetic_ratio=args.synthetic_ratio,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
    )
    print(f"stub training completed: {args.output_dir}")


if __name__ == "__main__":
    main()
