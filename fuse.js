const { FuseBox, WebIndexPlugin, Babel7Plugin } = require("fuse-box");
const fuse = FuseBox.init({
  homeDir: "src",
  target: "browser@es5",
  log: {
    enabled: true,
    showBundledFiles: true
  },
  output: "dist/$name.js",
  plugins: [
    WebIndexPlugin({ title: "VAFlow Admin Panel"}),
    Babel7Plugin({
      sourceMaps: true,
      presets: ["babel-preset-solid"]
    })],
});
fuse.dev(); // launch http server
fuse
  .bundle("ap")
  .instructions(" > index.tsx")
  .hmr()
  .watch();
fuse.run();