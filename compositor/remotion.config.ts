import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Software rendering — no GPU in the container.
Config.setChromiumOpenGlRenderer("angle");
