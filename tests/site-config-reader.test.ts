import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractBlock, matchInBlock } from "../scripts/read-site-config.mjs";

// 上游默认配置的缩影：字段齐全，块顺序固定
const DEFAULTS = `
export const siteConfig: SiteConfig = {
	navbarTitle: { mode: "text-icon", text: "MizukiUI" },
	font: { mode: "custom" },
};
`;

const MODE = /mode:\s*["']([^"']+)["']/;
const TEXT = /text:\s*["']([^"']+)["']/;

describe("Node 脚本读取站点配置", () => {
	it("没有覆盖文件时读上游默认值", () => {
		assert.equal(matchInBlock([DEFAULTS], "navbarTitle", MODE), "text-icon");
		assert.equal(matchInBlock([DEFAULTS], "font", MODE), "custom");
	});

	it("覆盖文件优先于默认值", () => {
		const override = `export default { navbarTitle: { mode: "logo" } };`;

		assert.equal(matchInBlock([override, DEFAULTS], "navbarTitle", MODE), "logo");
	});

	it("覆盖块里缺少的字段继续回退到默认值", () => {
		// 只覆盖 text，mode 仍应取上游默认
		const override = `export default { navbarTitle: { text: "覆盖标题" } };`;
		const sources = [override, DEFAULTS];

		assert.equal(matchInBlock(sources, "navbarTitle", TEXT), "覆盖标题");
		assert.equal(matchInBlock(sources, "navbarTitle", MODE), "text-icon");
	});

	it("取值不会越过块边界串到相邻配置", () => {
		// navbarTitle 块是空的，后面 font.mode 不能被当成标题模式
		const override = `export default {
			navbarTitle: {},
			font: { mode: "system" },
		};`;

		assert.equal(matchInBlock([override, DEFAULTS], "navbarTitle", MODE), "text-icon");
	});

	it("覆盖文件里不存在的块直接跳过", () => {
		const override = `export default { title: "我的站点" };`;

		assert.equal(matchInBlock([override, DEFAULTS], "navbarTitle", MODE), "text-icon");
	});

	it("所有来源都没有该块时返回 null，由调用方兜底", () => {
		assert.equal(matchInBlock([DEFAULTS], "notAConfigBlock", MODE), null);
	});

	it("块内嵌套对象不会提前截断", () => {
		const content = `{
			banner: { src: { desktop: ["a"] }, position: "center" },
			navbarTitle: { mode: "logo" },
		}`;

		const banner = extractBlock(content, "banner");
		assert.match(banner, /position:\s*"center"/);
		assert.equal(matchInBlock([content], "navbarTitle", MODE), "logo");
	});

	it("花括号不配平时视为没有该块", () => {
		assert.equal(extractBlock(`navbarTitle: { mode: "logo"`, "navbarTitle"), null);
	});
});
