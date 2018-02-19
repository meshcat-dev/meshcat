from setuptools import setup

setup(name="meshtv",
    version="0.0.1",
    description="Browser-based visualizer for 3D geometries and scenes",
    author="Robin Deits",
    license="MIT",
    packages=["meshtv"],
    install_requires=[
      "u-msgpack-python >= 2.4.1",
      "numpy >= 1.14.0",
      "websockets >= 4.0.1",
    ],
    zip_safe=False,
    include_package_data=True
)



