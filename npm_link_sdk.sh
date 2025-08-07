#!/bin/bash

# For local development, we need to symlink the SDK to the frontend node_modules
cd ./packages/passkey && pnpm link --global
cd ../../

# symlink the SDK to the frontend
cd frontend && pnpm link --global @web3authn/passkey
cd ../

# symlink the SDK to the relay-server
cd relay-server && pnpm link --global @web3authn/passkey
cd ../