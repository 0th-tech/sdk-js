.PHONY: demo circuit test typecheck clean fmt fmt-check

CIRCUIT_VERSION ?= v0.1.1
CIRCUIT_RELEASE = https://github.com/0th-tech/circuit/releases/download/$(CIRCUIT_VERSION)

demo:
	pnpm --filter demo dev

# target/circuit/fixture.json, from the circuit's release
circuit:
	mkdir -p target/circuit
	curl -fsSL $(CIRCUIT_RELEASE)/fixture.json -o target/circuit/fixture.json

# Needs make circuit once
test:
	pnpm test

typecheck:
	pnpm run typecheck
	pnpm --filter demo run typecheck

clean:
	rm -rf target examples/demo/dist

fmt:
	pnpm run fmt

fmt-check:
	pnpm run fmt-check
