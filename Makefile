include .env

run:
	docker-compose up frontend

prune:
	echo y | docker system prune

run-npm:
	npm run dev

build-dev:
	docker build --tag ${DEV_DOCKER_CONTAINER} -f ./Dockerfile.dev .
	make copy IMAGE=${DEV_DOCKER_CONTAINER} COPY_TO_PATH="./widget-dev.zip" COPY_FROM_PATH="/tmp/widget.zip"

build-prod:
	docker build --tag ${PROD_DOCKER_CONTAINER} -f ./Dockerfile.prod .
	make copy IMAGE=${PROD_DOCKER_CONTAINER} COPY_TO_PATH="./widget-prod.zip" COPY_FROM_PATH="/tmp/widget.zip"

copy:
	export SYNC_DOCKER_ID=`docker run -d $(IMAGE) true`; \
	rm -rf $(COPY_TO_PATH); \
	docker cp $${SYNC_DOCKER_ID}:/tmp/widget.zip $(COPY_TO_PATH); \
	docker rm $${SYNC_DOCKER_ID}
