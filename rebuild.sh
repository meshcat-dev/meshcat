#!/bin/bash
#
# Re-generates the files in `meshcat/dist` using a reproducible Docker build.
#
# This script uses Docker. For installation instructions, refer to MeshCat's
# top-level Readme.md file.

# Fail-fast on errors.
set -euo pipefail

# Use the buildkit flavor of docker.
export DOCKER_BUILDKIT=1

# Set our working to directory `meshcat/rebuild/`.
SRC="${BASH_SOURCE%/*}"
cd $SRC
echo $SRC

# Tell webpack to exit immediately once it's finished building.
# sed -i -e 's#watch: true#watch: false#' ./tmp/webpack.config.js

# Run `yarn install` and snapshot the result into an image.
image="meshcat-webpack:latest"
docker build -t ${image} .

rm -rf tmp

# Starting from that image, run webpack against our `src` file(s).
container="meshcat-webpack"
(docker container rm ${container} 2>&1 || true) > /dev/null
docker run --rm -it\
  -v $PWD:/home/app \
  --name=${container} ${image}

# # Copy the relevant webpack outputs into `meshcat/dist/.
# for name in main.min.js main.min.js.THIRD_PARTY_LICENSES.json; do
#   docker cp ${container}:/usr/src/app/dist/${name} dist/
# done

# Clean up.
(docker container rm ${container} 2>&1 || true) > /dev/null

echo "rebuild.sh: SUCCESS!"
