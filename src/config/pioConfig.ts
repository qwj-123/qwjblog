import type { PioConfig } from "../types/config";

// Pio 看板娘配置
export const pioConfig: PioConfig = {
	enable: false, // 已切换到互动式 2D 桌宠；保留 Live2D 配置用于回退
	models: ["/pio/models/NOIR/noir.model3.json"], // 默认模型路径
	position: "left", // 模型位置
	width: 280, // 默认宽度
	height: 250, // 默认高度
	mode: "draggable", // 默认为可拖拽模式
	hiddenOnMobile: true, // 默认在移动设备上隐藏
	hideAboutMenu: false, // 隐藏内置 About 菜单按钮
	dialog: {
		welcome: "欢迎来到 Mizuki 博客！", // 欢迎词
		touch: [
			"你在做什么呀？",
			"不要一直戳我啦！",
			"请保持礼貌哦！",
			"不要这样欺负我嘛！",
		], // 触摸提示
		home: "点击这里返回首页！", // 首页提示
		skin: ["想看看我的新装扮吗？", "这套新装扮很好看吧～"], // 换装提示
		close: "QWQ 下次再见～", // 关闭提示
		link: "https://github.com/LyraVoid/Mizuki", // 关于链接
	},
};
