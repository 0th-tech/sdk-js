.PHONY: demo circuit contracts test e2e typecheck clean fmt fmt-check

RELEASES = https://github.com/0th-tech
CIRCUIT_VERSION ?= v0.1.1
ACCOUNT_VERSION ?= v0.1.1
REGISTRY_VERSION ?= v0.1.1

SERVER ?= https://github.com/0th-tech/server.git\#main
DEVNET_IMAGE = starknetfoundation/starknet-devnet-rs:0.11.0

E2E_DEVNET_PORT = 5151
E2E_SERVER_PORT = 8788
E2E_DOWN = docker rm -f 0th-e2e-devnet 0th-e2e-server > /dev/null 2>&1 || true

demo:
	pnpm --filter demo dev

# target/circuit/fixture.json, from the circuit's release
circuit:
	mkdir -p target/circuit
	curl -fsSL $(RELEASES)/circuit/releases/download/$(CIRCUIT_VERSION)/fixture.json -o target/circuit/fixture.json

# target/contracts/*.json, the compiled classes of the account's and the registry's releases
contracts:
	mkdir -p target/contracts
	for file in account_Account verifier_UltraKeccakZKHonkVerifier; do \
		for kind in contract_class compiled_contract_class; do \
			curl -fsSL $(RELEASES)/account/releases/download/$(ACCOUNT_VERSION)/$$file.$$kind.json \
				-o target/contracts/$$file.$$kind.json || exit 1; \
		done; \
	done
	for kind in contract_class compiled_contract_class; do \
		curl -fsSL $(RELEASES)/registry/releases/download/$(REGISTRY_VERSION)/registry_Registry.$$kind.json \
			-o target/contracts/registry_Registry.$$kind.json || exit 1; \
	done

# Needs make circuit once
test:
	pnpm test

# A login then a transfer on a new devnet. Linux only, for the host network
e2e:
	$(E2E_DOWN)
	docker build -q -t 0th-e2e-server $(SERVER)
	docker run -d --name 0th-e2e-devnet --network host $(DEVNET_IMAGE) --seed 0 --port $(E2E_DEVNET_PORT)
	RPC_URL=http://127.0.0.1:$(E2E_DEVNET_PORT)/rpc PORT=$(E2E_SERVER_PORT) node e2e/deploy.ts \
		|| { $(E2E_DOWN); exit 1; }
	docker run -d --name 0th-e2e-server --network host --env-file target/e2e.env 0th-e2e-server
	node --env-file=target/e2e.env --test e2e/ || { docker logs 0th-e2e-server; $(E2E_DOWN); exit 1; }
	$(E2E_DOWN)

typecheck:
	pnpm run typecheck
	pnpm --filter demo run typecheck

clean:
	rm -rf target examples/demo/dist

fmt:
	pnpm run fmt

fmt-check:
	pnpm run fmt-check
