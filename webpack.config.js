module.exports = [{
	entry: './src/index.js',
	output: {
		library: "MeshCat",
		libraryTarget: 'umd'
	},
	watch: true,
	mode: "development",
	devtool: "eval-cheap-source-map"
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
