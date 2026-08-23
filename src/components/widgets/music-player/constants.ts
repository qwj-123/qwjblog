import type { Song } from "./types";

export const STORAGE_KEY_VOLUME = "music-player-volume";

export const DEFAULT_VOLUME = 0.7;

export const DEFAULT_COVER_URL = "/favicon/favicon.ico";

// 曲目来源与许可见 public/assets/music/ATTRIBUTION.md。
export const LOCAL_PLAYLIST: Song[] = [
	{
		id: 1,
		title: "宁静氛围",
		artist: "MusicLFiles",
		cover: DEFAULT_COVER_URL,
		url: "assets/music/url/placid-ambient.ogg",
		duration: 141,
	},
	{
		id: 2,
		title: "轻声絮语",
		artist: "Kjartan Abel",
		cover: DEFAULT_COVER_URL,
		url: "assets/music/url/whispers.ogg",
		duration: 115,
	},
	{
		id: 3,
		title: "静谧时光",
		artist: "Tamlin Lollis Love",
		cover: DEFAULT_COVER_URL,
		url: "assets/music/url/peaceful.ogg",
		duration: 161,
	},
];

export const DEFAULT_SONG: Song = {
	title: "示例歌曲",
	artist: "示例歌手",
	cover: DEFAULT_COVER_URL,
	url: "",
	duration: 0,
	id: 0,
};

export const DEFAULT_METING_API =
	"https://www.bilibili.uno/api?server=:server&type=:type&id=:id&auth=:auth&r=:r";
export const DEFAULT_METING_ID = "14164869977";
export const DEFAULT_METING_SERVER = "netease";
export const DEFAULT_METING_TYPE = "playlist";

export const ERROR_DISPLAY_DURATION = 3000;
export const SKIP_ERROR_DELAY = 1000;
