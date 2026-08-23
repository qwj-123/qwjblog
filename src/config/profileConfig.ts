import type { ProfileConfig } from "../types/config";

// 个人资料配置
export const profileConfig: ProfileConfig = {
	avatar: "assets/images/profile-avatar.png", // 相对于 /src 目录。如果以 '/' 开头，则相对于 /public 目录
	name: "古人开智后的记事本",
	bio: "记录技术、生活与灵感",
	typewriter: {
		enable: true, // 启用个人简介打字机效果
		speed: 80, // 打字速度（毫秒）
	},
	links: [],
};
