"""Print the versioned, offline evaluation report as JSON."""

import json

from relay.evaluation import run_evaluation

if __name__ == "__main__":
    print(json.dumps(run_evaluation(), indent=2, ensure_ascii=False))
