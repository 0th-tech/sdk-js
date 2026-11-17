.PHONY: demo test e2e typecheck clean fmt fmt-check

# A download that fails leaves no partial file behind
.DELETE_ON_ERROR:

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

# Release files, downloaded again whenever this Makefile changes, since it pins the versions
DOWNLOAD = mkdir -p $(@D) && curl -fsSL $(RELEASES)/$(1)/releases/download/$(2)/$(@F) -o $@

target/circuit/%: Makefile
	$(call DOWNLOAD,circuit,$(CIRCUIT_VERSION))

target/contracts/registry_%: Makefile
	$(call DOWNLOAD,registry,$(REGISTRY_VERSION))

target/contracts/%: Makefile
	$(call DOWNLOAD,account,$(ACCOUNT_VERSION))

FIXTURE = target/circuit/fixture.json
CONTRACTS = $(foreach name,account_Account verifier_UltraKeccakZKHonkVerifier registry_Registry, \
	target/contracts/$(name).contract_class.json target/contracts/$(name).compiled_contract_class.json)

test: $(FIXTURE)
	pnpm test

# A login then a transfer on a new devnet. Linux only, for the host network
e2e: $(FIXTURE) $(CONTRACTS)
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
