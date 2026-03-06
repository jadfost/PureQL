#!/usr/bin/env python3
"""Start the PureQL bridge server for development.

Usage:
    python scripts/start_bridge.py [port]

Default port: 9741
"""

import sys
import os

# Add core to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))

from pureql.bridge import main

if __name__ == "__main__":
    main()
