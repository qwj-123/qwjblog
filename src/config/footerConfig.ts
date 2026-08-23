import type { FooterConfig } from "../types/config";

// 页脚配置
export const footerConfig: FooterConfig = {
	enable: true, // 是否启用Footer HTML注入功能
	customHtml:
		'<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">桂ICP备2026018043号-1</a> ' +
		'<a href="https://beian.mps.gov.cn/#/query/webSearch?code=45080202000447" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;">' +
		'<img src="/assets/beian/logo01.png" alt="公安备案" style="height:14px;width:auto;margin-right:4px;vertical-align:-2px;">' +
		'桂公网安备45080202000447号</a>',
};
