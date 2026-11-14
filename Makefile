.PHONY: circuit demo typecheck clean fmt fmt-check

CIRCUIT_VERSION ?= v0.1.0
CIRCUIT_RELEASE = https://github.com/0th-tech/circuit/releases/download/$(CIRCUIT_VERSION)

# target/circuit/{login.json,vk}, from the circuit's release
circuit:
	mkdir -p target/circuit
	for file in login.json vk; do \
		curl -fsSL $(CIRCUIT_RELEASE)/$$file -o target/circuit/$$file || exit 1; \
	done

demo:
	pnpm --filter demo dev

typecheck:
	pnpm run typecheck
	pnpm --filter demo run typecheck

clean:
	rm -rf target examples/demo/dist

fmt:
	pnpm run fmt

fmt-check:
	pnpm run fmt-check
