import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="L1 synthetic data generator stub")
    parser.add_argument("--templates", default=None)
    parser.add_argument("--output", required=True)
    parser.add_argument("--count", type=int, default=0)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    # L1 stub. L5 will replace this with spatial synthetic generation.
    rows = []
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"wrote {len(rows)} synthetic rows to {out}")


if __name__ == "__main__":
    main()
