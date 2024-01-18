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
cd "${BASH_SOURCE%/*}"

# Copy the project files somewhere that docker can find them.
rm -rf tmp
mkdir -p tmp
cp -p ../package.json ./tmp/
cp -p ../webpack.config.js ./tmp/
cp -p ../yarn.lock ./tmp/

# Tell webpack to exit immediately once it's finished building.
sed -i -e 's#watch: true#watch: false#' ./tmp/webpack.config.js

# Run `yarn install` and snapshot the result into an image.
image="meshcat-webpack:latest"
docker build -t ${image} .
rm -rf tmp

# Starting from that image, run webpack against our `src` file(s).
container="meshcat-webpack"
(docker container rm ${container} 2>&1 || true) > /dev/null
docker run \
  --mount type=bind,source="$(cd .. && pwd)"/src,target=/usr/src/app/src \
  --name=${container} ${image}

# Copy the relevant webpack outputs into `meshcat/dist/.
for name in main.min.js main.min.js.THIRD_PARTY_LICENSES.json; do
  docker cp ${container}:/usr/src/app/dist/${name} ../dist/
done

# Clean up.
(docker container rm ${container} 2>&1 || true) > /dev/null

echo "rebuild.sh: SUCCESS!"
