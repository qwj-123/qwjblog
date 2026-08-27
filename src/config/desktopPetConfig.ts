import type { DesktopPetConfig } from "../types/config";

export const desktopPetConfig: DesktopPetConfig = {
	enable: true,
	image: "/assets/desktop-pet/character-base.png",
	position: "left",
	height: 250,
	draggable: true,
	hiddenOnMobile: true,
	dialog: {
		welcome: "欢迎回来，今天也一起加油吧！",
		touch: [
			"是在叫我吗？",
			"我一直都在这里哦。",
			"要记得偶尔休息一下。",
			"今天想读点什么呢？",
			"别一直戳我啦～",
		],
		close: "那我先休息一会儿，下次见。",
	},
};
