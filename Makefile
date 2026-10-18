run:
	npm run dev

build:
	npm run build
	mkdir -p site
	cp chrome-qr-code.zip site/chrome-qr-code.zip

deploy: build
	git checkout main
	git add -A
	git commit -m "$$(copilot -sp 'Analyze the staged git changes and generate a concise commit message. Output ONLY the commit message. Do not execute any commands. Do not include quotes, markdown, explanation, or bullet points.')"
	git push origin main
