module.exports = {
	entry: './src/index.js',
	output: {
		library: "MeshCat",
		libraryTarget: 'umd'
	},
	watch: true,
	devtool: "cheap-eval-source-map"
};
