import os

intro = """# System Prompt: Aletheia Frontend & UI Implementation

You are an expert Frontend and Smart Contract integration engineer. Your task is to build a React application (Next.js preferred) based on the architectural guidelines provided below.

This frontend interfaces with the "Aletheia Treasury" - a cross-chain zero-knowledge payroll system.

The core complexity of this application lies in:
1. Connecting to Web3 wallets (via Wagmi/Viem).
2. Interacting with the EVM to fetch Merkle Patricia Trie (MPT) storage proofs (`eth_getProof`).
3. Calling `@noir-lang/noir_js` to compile zero-knowledge proofs locally in the browser.
4. Implementing a sleek, dark-mode, high-end "Institutional Cryptography" UI.

Below are FIVE attached architectural documents defining the exact flow and design system you must adhere to. Read them completely. Make sure to abide by the Critical Enforcement Directives and UX concerns at the bottom.

---

"""

files = [
    "ALETHEIA_TREASURY_ARCHITECTURE.md",
    "ALETHEIA_FRONTEND_ARCHITECTURE.md",
    "ALETHEIA_UI_UX_ARCHITECTURE.md",
    "ALETHEIA_FRONTEND_ADDITIONAL_CONTEXT.md",
    "ALETHEIA_FRONTEND_DATA_AND_UX_CONCERNS.md"
]

out_content = intro

for f in files:
    path = os.path.join("/home/yash/Convergence/aletheiaOld/frontend-context", f)
    with open(path, "r") as file:
        out_content += f"<{f.split('.')[0]}>\n"
        out_content += file.read() + "\n"
        out_content += f"</{f.split('.')[0]}>\n\n---\n\n"

with open("/home/yash/Convergence/aletheiaOld/frontend-context/ALETHEIA_MASTER_FRONTEND_PROMPT.md", "w") as out:
    out.write(out_content)

print("Master context successfully compiled.")
