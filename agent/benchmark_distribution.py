#!/usr/bin/env python3
"""
Ultra-Fast Full C++ Monte Carlo Engine + Gemma Benchmark
Uses num_predict=10 for max token generation speed (<0.5s per run).
Stops immediately if 50 CONSECUTIVE identical Gemma conclusions are reached.
"""

import json
import subprocess
import urllib.request
import time
import sys
from collections import Counter

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "gemma4:e2b-mlx"
MCP_SERVER_CMD = ["node", "server/mcp_server.js"]

class FastSimulationBenchmark:
    def __init__(self, model=MODEL_NAME):
        self.model = model
        self.mcp_process = None

    def start_mcp_server(self):
        try:
            self.mcp_process = subprocess.Popen(
                MCP_SERVER_CMD,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            print("✓ MonteCarloSuite MCP Server started (stdio JSON-RPC).", flush=True)
        except Exception as e:
            print(f"Error starting MCP Server: {e}", flush=True)
            sys.exit(1)

    def call_mcp_tool(self, tool_name, tool_args):
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": tool_args
            }
        }

        self.mcp_process.stdin.write(json.dumps(request) + "\n")
        self.mcp_process.stdin.flush()

        response_line = self.mcp_process.stdout.readline()
        if not response_line:
            return {"error": "No response from MCP Server"}

        try:
            resp = json.loads(response_line)
            content_text = resp["result"]["content"][0]["text"]
            return json.loads(content_text)
        except Exception as e:
            return {"error": f"Failed to parse MCP response: {e}"}

    def extract_conclusion(self, text):
        text_upper = text.upper().strip()
        if "BUY" in text_upper:
            return "BUY"
        elif "SELL" in text_upper:
            return "SELL"
        return "HOLD"

    def run_benchmark(self, max_simulations=1000, early_stop_threshold=50):
        print(f"🚀 Starting Fast C++ Engine + Gemma Agent Benchmark (Max: {max_simulations} Runs)", flush=True)
        print(f"⚡ Mode: Ultra-Fast Short Token Response (<0.5s/run)", flush=True)
        print(f"Early Stop Rule: 50 consecutive identical Gemma conclusions.\n", flush=True)

        scenarios = [
            {"S0": 100, "K": 100, "r": 0.05, "sigma": 0.20, "T": 1.0, "isCall": True},   # ATM Call
            {"S0": 100, "K": 110, "r": 0.05, "sigma": 0.20, "T": 1.0, "isCall": True},   # OTM Call
            {"S0": 100, "K": 90,  "r": 0.05, "sigma": 0.20, "T": 1.0, "isCall": True},   # ITM Call
            {"S0": 100, "K": 100, "r": 0.05, "sigma": 0.40, "T": 0.5, "isCall": True},   # High Vol Call
            {"S0": 100, "K": 100, "r": 0.05, "sigma": 0.15, "T": 0.25, "isCall": False}, # Low Vol Put
        ]

        distribution = Counter()
        consecutive_streak = 0
        last_conclusion = None
        start_time = time.time()
        completed_runs = 0

        for i in range(1, max_simulations + 1):
            sc = scenarios[(i - 1) % len(scenarios)]
            
            # 1. C++ Monte Carlo Engine calls via MCP
            eur = self.call_mcp_tool("price_european_option", {
                "S0": sc["S0"], "K": sc["K"], "r": sc["r"], "sigma": sc["sigma"], "T": sc["T"], "isCall": sc["isCall"], "numTrials": 100000
            })
            asian = self.call_mcp_tool("price_asian_option", {
                "S0": sc["S0"], "K": sc["K"], "r": sc["r"], "sigma": sc["sigma"], "T": sc["T"], "isCall": sc["isCall"], "numTrials": 100000, "numSteps": 252
            })
            greeks = self.call_mcp_tool("calculate_greeks", {
                "S0": sc["S0"], "K": sc["K"], "r": sc["r"], "sigma": sc["sigma"], "T": sc["T"], "isCall": sc["isCall"], "numTrials": 100000
            })

            # 2. Fast prompt for Gemma
            prompt = f"Option: S0={sc['S0']}, K={sc['K']}, Eur=${eur.get('optionPrice')}, Asian=${asian.get('optionPrice')}, Delta={greeks.get('greeks',{}).get('delta')}. Output single word: BUY, SELL, or HOLD."

            payload = json.dumps({
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "options": {
                    "num_predict": 10,
                    "temperature": 0.1
                }
            }).encode('utf-8')

            req = urllib.request.Request(OLLAMA_URL, data=payload, headers={'Content-Type': 'application/json'})

            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    res = json.loads(resp.read().decode('utf-8'))
                    text = res["message"]["content"]
                    conclusion = self.extract_conclusion(text)

                    completed_runs += 1
                    distribution[conclusion] += 1

                    if conclusion == last_conclusion:
                        consecutive_streak += 1
                    else:
                        consecutive_streak = 1
                        last_conclusion = conclusion

                    print(f"[{completed_runs:04d}/{max_simulations}] C++ Engine + Gemma ➔ {conclusion:4s} | Streak: {consecutive_streak:02d}/{early_stop_threshold}", flush=True)

                    if consecutive_streak >= early_stop_threshold:
                        print(f"\n🛑 EARLY STOPPING TRIGGERED AT RUN #{completed_runs}!", flush=True)
                        print(f"Reason: Gemma gave 50 CONSECUTIVE identical conclusions ('{conclusion}').", flush=True)
                        break

            except Exception as e:
                print(f"[{i:04d}/{max_simulations}] Error: {e}", flush=True)
                time.sleep(0.5)

        total_time = time.time() - start_time

        print("\n=================== 1,000 SIMULATION BENCHMARK REPORT ===================", flush=True)
        print(f"Total Full Simulations Executed : {completed_runs} / {max_simulations}", flush=True)
        print(f"Total Benchmark Time           : {total_time:.2f} seconds ({total_time/60:.2f} minutes)", flush=True)
        print(f"Average Speed per Full Run     : {(total_time / completed_runs):.3f} seconds / run", flush=True)
        print("\nConclusion Distribution Breakdown:", flush=True)
        for conc, cnt in distribution.most_common():
            pct = (cnt / completed_runs) * 100
            bar = "█" * int(pct / 2)
            print(f"  {conc:4s} : {cnt:4d} ({pct:5.1f}%) | {bar}", flush=True)
        print("=========================================================================\n", flush=True)

    def stop(self):
        if self.mcp_process:
            self.mcp_process.terminate()

if __name__ == "__main__":
    benchmark = FastSimulationBenchmark()
    benchmark.start_mcp_server()
    try:
        benchmark.run_benchmark(max_simulations=1000, early_stop_threshold=50)
    finally:
        benchmark.stop()
