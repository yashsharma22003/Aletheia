# Mock TEE Prover Service

This acts as a mockup for the future Chainlink Confidential Compute (CC) Secure Enclaves. It is an off-chain Node.js/Express service that performs the heavily intensive Zero-Knowledge proof generation using Barretenberg and Noir, and then relays those proofs to the Oracle network.

## Project Overview

In the Aletheia protocol, it's not feasible for the end-user (Employee) to generate a massive ZK Proof in their browser. Instead, this **Prover Service** acts as the employer's backend infrastructure.

1. It listens for requests from the frontend (Claim Terminal).
2. Uses the Barretenberg backend to synthesize a Noir ZK-SNARK proof.
3. Automatically triggers the Chainlink `proof_oracle` to register the crushed ZK Proof Hash on the destination chain.

## Tech Stack

- **Node.js** with **Express** (REST API)
- **Barretenberg** (ZK Proving Backend)
- **NoirJS** (Noir circuit compilation and execution)
- **TypeScript**

## Getting Started

Make sure you have Node.js (v18+) and npm/yarn installed.

### 1. Installation

Navigate to the `mock-tee-prover-service` directory and install the necessary dependencies:

```bash
cd mock-tee-prover-service
npm install
```

### 2. Proofs directory initialization

Ensure you have your compiled Noir circuits (`.json` artifacts) properly placed in the `proofs/` directory if required by the service logic. Usually, these can be built from the root `circuits` directory and copied here.

### 3. Running the Service

Start the local development server:

```bash
npm run dev
# or 
npx ts-node src/index.ts
```

The server binds to `http://localhost:3000` by default.

## Available Endpoints

- `POST /prove` - Provide the `chequeId` and the secret circuit inputs. This endpoint synthesizes the proof and returns the proof artifacts, returning them back to the frontend/calling service.
- `POST /submit-proof` - (Mock) Relays the generated proof to the Chainlink `proof_oracle`.

## Migration to Chainlink CC

This service is a **temporary mock**. All logic present here (especially the ZK signature check and proof synthesis) is architected to be migrated directly into a live **Chainlink Confidential Compute (CC) TEE Enclave** once the Chainlink CC mainnet is fully live.
