import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const [inputArg, outputArg] = process.argv.slice(2);

if (!inputArg || !outputArg) {
	console.error(
		"Usage: node scripts/remove-checkerboard-background.mjs <input> <output>",
	);
	process.exit(1);
}

const input = path.resolve(inputArg);
const output = path.resolve(outputArg);
const { data, info } = await sharp(input)
	.removeAlpha()
	.raw()
	.toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const pixelCount = width * height;
const background = new Uint8Array(pixelCount);
const queued = new Uint8Array(pixelCount);
const queue = new Int32Array(pixelCount);
let head = 0;
let tail = 0;

const isCheckerboard = (index) => {
	const offset = index * channels;
	const red = data[offset];
	const green = data[offset + 1];
	const blue = data[offset + 2];
	const darkest = Math.min(red, green, blue);
	const lightest = Math.max(red, green, blue);

	return darkest >= 228 && lightest - darkest <= 16;
};

const enqueue = (index) => {
	if (queued[index] || !isCheckerboard(index)) return;
	queued[index] = 1;
	queue[tail++] = index;
};

for (let x = 0; x < width; x += 1) {
	enqueue(x);
	enqueue((height - 1) * width + x);
}

for (let y = 1; y < height - 1; y += 1) {
	enqueue(y * width);
	enqueue(y * width + width - 1);
}

while (head < tail) {
	const index = queue[head++];
	background[index] = 1;
	const x = index % width;
	const y = Math.floor(index / width);

	if (x > 0) enqueue(index - 1);
	if (x + 1 < width) enqueue(index + 1);
	if (y > 0) enqueue(index - width);
	if (y + 1 < height) enqueue(index + width);
}

const rgba = Buffer.alloc(pixelCount * 4);
let transparentPixels = 0;

for (let index = 0; index < pixelCount; index += 1) {
	const source = index * channels;
	const target = index * 4;
	rgba[target] = data[source];
	rgba[target + 1] = data[source + 1];
	rgba[target + 2] = data[source + 2];
	rgba[target + 3] = background[index] ? 0 : 255;
	if (background[index]) transparentPixels += 1;
}

await sharp(rgba, { raw: { width, height, channels: 4 } })
	.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
	.png({ compressionLevel: 9 })
	.toFile(output);

const transparentRatio = transparentPixels / pixelCount;
console.log(
	JSON.stringify({
		input,
		output,
		width,
		height,
		transparentPixels,
		transparentRatio: Number(transparentRatio.toFixed(4)),
	}),
);

if (transparentRatio < 0.25 || transparentRatio > 0.95) {
	console.error("Unexpected transparency ratio; inspect the output before use.");
	process.exit(2);
}
