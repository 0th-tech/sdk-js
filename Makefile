.PHONY: demo typecheck clean fmt fmt-check

demo:
	pnpm --filter demo dev

typecheck:
	pnpm run typecheck
	pnpm --filter demo run typecheck

clean:
	rm -rf examples/demo/dist

fmt:
	pnpm run fmt

fmt-check:
	pnpm run fmt-check
