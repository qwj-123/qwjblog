export interface FootprintPhoto {
	src?: string;
	alt: string;
	caption: string;
}

export interface FootprintEntry {
	slug: string;
	provinceId: string;
	province: string;
	city: string;
	status: string;
	period: string;
	summary: string;
	story: string[];
	highlights: string[];
	photos: FootprintPhoto[];
}

export const footprintEntries: FootprintEntry[] = [
	{
		slug: "shenzhen",
		provinceId: "guangdong",
		province: "广东",
		city: "深圳",
		status: "目前所在地",
		period: "2026 · 记录中",
		summary: "在海风、绿意与城市节奏之间，记录正在发生的深圳生活。",
		story: [
			"深圳是一座很适合边走边看的城市。高楼与公园离得很近，忙碌的日常里，也总能找到一小段面向大海的安静时间。",
			"这份足迹先从此刻开始：记下熟悉的街道、偶然遇见的晚霞，以及那些看似普通、回头却会想念的生活片段。",
		],
		highlights: ["深圳湾的海风", "南山的城市夜景", "街角的日常"],
		photos: [
			{
				src: "/images/footprints/shenzhen/shenzhen-bay-01.webp",
				alt: "深圳人才公园步道与后海城市天际线",
				caption: "人才公园 · 蓝调时刻",
			},
			{
				src: "/images/footprints/shenzhen/shenzhen-bay-02.webp",
				alt: "深圳湾水岸晚霞与后海高楼",
				caption: "深圳湾 · 晚霞初起",
			},
			{
				src: "/images/footprints/shenzhen/shenzhen-bay-03.webp",
				alt: "入夜后的深圳后海天际线和蓝色灯光廊桥",
				caption: "后海天际线 · 华灯渐亮",
			},
			{
				src: "/images/footprints/shenzhen/shenzhen-bay-04.webp",
				alt: "深圳湾夜景与水面上的城市灯光倒影",
				caption: "深圳湾夜色 · 灯影入水",
			},
		],
	},
];

export const footprintBySlug = Object.fromEntries(
	footprintEntries.map((entry) => [entry.slug, entry]),
);

export const visitedProvinceIds = new Set(
	footprintEntries.map((entry) => entry.provinceId),
);

export const provinceNameZh: Record<string, string> = {
	anhui: "安徽",
	beijing: "北京",
	chongqing: "重庆",
	fujian: "福建",
	gansu: "甘肃",
	guangdong: "广东",
	"guangxi-zhuang": "广西",
	guizhou: "贵州",
	hainan: "海南",
	hebei: "河北",
	heilongjiang: "黑龙江",
	henan: "河南",
	"hong-kong": "香港",
	hubei: "湖北",
	hunan: "湖南",
	jiangsu: "江苏",
	jiangxi: "江西",
	jilin: "吉林",
	liaoning: "辽宁",
	macau: "澳门",
	"nei-mongol": "内蒙古",
	"ningxia-hui": "宁夏",
	quinghai: "青海",
	shaanxi: "陕西",
	shandong: "山东",
	shanghai: "上海",
	shanxi: "山西",
	sichuan: "四川",
	tianjin: "天津",
	"xinjiang-uygur": "新疆",
	xizang: "西藏",
	yunnan: "云南",
	zhejiang: "浙江",
};
