import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
	DEFAULT_COVER_URL,
	LOCAL_PLAYLIST,
} from "../src/components/widgets/music-player/constants.ts";

const bannerSource = await readFile(
	new URL("../src/components/layout/Banner.astro", import.meta.url),
	"utf8",
);
const wallpaperSource = await readFile(
	new URL("../src/components/misc/FullscreenWallpaper.astro", import.meta.url),
	"utf8",
);
const wallpaperConfigSource = await readFile(
	new URL("../src/config/backgroundWallpaper.ts", import.meta.url),
	"utf8",
);
const siteConfigSource = await readFile(
	new URL("../src/config/siteConfig.ts", import.meta.url),
	"utf8",
);
const imageSource = await readFile(
	new URL("../src/components/atoms/Image/Image.astro", import.meta.url),
	"utf8",
);
const viewportImageSource = await readFile(
	new URL("../src/components/atoms/Image/ViewportImage.astro", import.meta.url),
	"utf8",
);
const imageSourceUtils = await readFile(
	new URL("../src/utils/image-source-utils.ts", import.meta.url),
	"utf8",
);
const musicCoverSource = await readFile(
	new URL(
		"../src/components/widgets/music-player/atoms/CoverImage.svelte",
		import.meta.url,
	),
	"utf8",
);

describe("Default image loading boundary", () => {
	it("uses media-qualified responsive sources for the first banner", () => {
		assert.match(bannerSource, /ViewportImage/);
		assert.match(bannerSource, /media="\(max-width: 767px\)"/);
		assert.match(bannerSource, /media="\(min-width: 768px\)"/);
		assert.match(bannerSource, /loading="lazy"[\s\S]*fetchpriority="low"/);
	});

	it("keeps inactive wallpaper requests low priority", () => {
		assert.match(wallpaperSource, /loading="lazy"/);
		assert.match(wallpaperSource, /fetchpriority="low"/);
		assert.doesNotMatch(wallpaperSource, /loading="eager"/);
		assert.doesNotMatch(wallpaperSource, /fetchpriority="high"/);
	});

	it("allows mirrored public assets to enter the Astro image pipeline", () => {
		assert.match(imageSource, /resolveImageMetadata/);
		assert.match(imageSource, /img && usePicture/);
		assert.match(
			imageSourceUtils,
			/if \(isRemoteImageSource\(src\)\) return src/,
		);
	});

	it("passes protocol-relative images through and emits the JPEG MIME type", () => {
		assert.match(imageSource, /const isRemote = isRemoteImageSource\(src\)/);
		assert.match(
			imageSource,
			/const isPublic = src\.startsWith\("\/"\) && !isRemote/,
		);
		assert.match(imageSource, /src={fullSrc}/);
		assert.doesNotMatch(imageSource, /url-utils/);
		assert.match(viewportImageSource, /format === "jpg" \? "jpeg" : format/);
		assert.match(
			viewportImageSource,
			/type={getImageMimeType\(source\.format\)}/,
		);
	});

	it("keeps local music assets deployable and uses the shared fallback cover", async () => {
		assert.ok(LOCAL_PLAYLIST.length > 0);
		assert.match(DEFAULT_COVER_URL, /^\//);
		const fallbackCover = await readFile(
			new URL(`../public${DEFAULT_COVER_URL}`, import.meta.url),
		);
		assert.ok(fallbackCover.length > 0);

		for (const song of LOCAL_PLAYLIST) {
			assert.ok(song.title.trim());
			assert.ok(song.artist.trim());
			assert.equal(song.cover, DEFAULT_COVER_URL);
			assert.match(song.url, /^assets\/music\/url\/[^?#]+$/);
			assert.ok(song.duration > 0);
			const audio = await readFile(
				new URL(`../public/${song.url}`, import.meta.url),
			);
			assert.ok(audio.length > 0);
		}

		assert.match(musicCoverSource, /loading="lazy"/);
		assert.match(musicCoverSource, /fetchpriority="low"/);
		assert.doesNotMatch(musicCoverSource, /fetchpriority="high"/);
	});

	it("keeps existing default-image mirrors synchronized with public files", async () => {
		const activeConfigSource = `${siteConfigSource}\n${wallpaperConfigSource}`;
		for (const group of ["desktop-banner", "mobile-banner"]) {
			for (let index = 1; index <= 4; index += 1) {
				const relative = `assets/${group}/${index}.webp`;
				let publicFile;
				try {
					publicFile = await readFile(
						new URL(`../public/${relative}`, import.meta.url),
					);
				} catch (error) {
					if (error?.code !== "ENOENT") throw error;
					assert.doesNotMatch(activeConfigSource, new RegExp(relative));
					continue;
				}
				const mirroredFile = await readFile(
					new URL(`../src/assets/public/${relative}`, import.meta.url),
				);
				assert.deepEqual(
					mirroredFile,
					publicFile,
					`${relative} mirror drifted`,
				);
			}
		}
	});
});
