module.exports = [{
	entry: './src/index.js',
	output: {
		library: "MeshCat",
		libraryTarget: 'umd'
	},
	watch: true,
	mode: "development",
	devtool: "cheap-eval-source-map"
}, {
	entry: './src/index.js',
	output: {
		filename: "main.min.js",
		library: "MeshCat",
		libraryTarget: 'umd'
	},
	watch: true,
	mode: "production"
}];
