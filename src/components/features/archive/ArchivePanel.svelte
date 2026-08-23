<script lang="ts">
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { formatDateToYYYYMMDD, getPostDateParts } from "@utils/date-utils";
import { comparePublishedDatesDescending } from "@utils/post-date-utils";
import { onMount } from "svelte";
import type { ArchivePanelProps, Group, Post } from "./types";

let {
	tags = $bindable([]),
	categories = $bindable([]),
	sortedPosts = [],
}: ArchivePanelProps = $props();

const params = new URLSearchParams(window.location.search);
tags = params.has("tag") ? params.getAll("tag") : [];
categories = params.has("category") ? params.getAll("category") : [];
const uncategorized = params.get("uncategorized");

let groups = $state<Group[]>([]);
let loaded = $state(false);

function formatDate(date: Date, dateOnly: boolean) {
	return formatDateToYYYYMMDD(date, dateOnly).slice(5);
}

function formatTag(tagList: string[]) {
	return tagList.map((t) => `#${t}`).join(" ");
}

onMount(async () => {
	let filteredPosts: Post[] = sortedPosts;

	if (tags.length > 0) {
		filteredPosts = filteredPosts.filter(
			(post) =>
				Array.isArray(post.data.tags) &&
				post.data.tags.some((tag) => tags.includes(tag)),
		);
	}

	if (categories.length > 0) {
		filteredPosts = filteredPosts.filter(
			(post) => post.data.category && categories.includes(post.data.category),
		);
	}

	if (uncategorized) {
		filteredPosts = filteredPosts.filter((post) => !post.data.category);
	}

	// 按发布时间倒序排序，确保不受置顶影响
	filteredPosts = filteredPosts
		.slice()
		.sort((a, b) =>
			comparePublishedDatesDescending(
				a.data.published,
				b.data.published,
				a.id,
				b.id,
			),
		);

	const grouped = filteredPosts.reduce(
		(acc, post) => {
			const year = getPostDateParts(
				post.data.published,
				post.data._publishedDateOnly,
			).year;
			if (!acc[year]) {
				acc[year] = [];
			}
			acc[year].push(post);
			return acc;
		},
		{} as Record<number, Post[]>,
	);

	const groupedPostsArray = Object.keys(grouped).map((yearStr) => ({
		year: Number.parseInt(yearStr, 10),
		posts: grouped[Number.parseInt(yearStr, 10)],
	}));

	groupedPostsArray.sort((a, b) => b.year - a.year);

	groups = groupedPostsArray;
	loaded = true;
});
</script>

<div class="card-base px-8 py-6">
	{#if loaded && groups.length === 0}
		<div class="flex flex-col items-center justify-center gap-10 py-10">
			<div class="thought-bubble">
				<span class="thought-text">这里空空如也，快来添加吧</span>
				<span class="dot dot-1"></span>
				<span class="dot dot-2"></span>
				<span class="dot dot-3"></span>
			</div>
			<img
				src="/assets/empty-state/mascot.png"
				alt=""
				class="w-28 h-auto max-w-full select-none pointer-events-none"
				loading="lazy"
			/>
		</div>
	{:else}
	{#each groups as group (group.year)}
		<div>
			<div class="flex flex-row w-full items-center h-15">
				<div
					class="w-[15%] md:w-[10%] transition text-2xl font-bold text-right text-75"
				>
					{group.year}
				</div>
				<div class="w-[15%] md:w-[10%]">
					<div
						class="h-3 w-3 bg-none rounded-full outline outline-(--primary) mx-auto
                  -outline-offset-2 z-50"
					></div>
				</div>
				<div class="w-[70%] md:w-[80%] transition text-left text-50">
					{group.posts.length}
					{i18n(
						group.posts.length === 1
							? I18nKey.postCount
							: I18nKey.postsCount,
					)}
				</div>
			</div>

			{#each group.posts as post (post.id)}
				<a
					href={post.url || `/posts/${post.id}/`}
					aria-label={post.data.title}
					class="group btn-plain block! h-10 w-full rounded-lg hover:text-[initial]"
				>
					<div
						class="flex flex-row justify-start items-center h-full"
					>
						<!-- date -->
						<div
							class="w-[15%] md:w-[10%] transition text-sm text-right text-50"
						>
							{formatDate(post.data.published, post.data._publishedDateOnly)}
						</div>

						<!-- dot and line -->
						<div
							class="w-[15%] md:w-[10%] relative dash-line h-full flex items-center"
						>
							<div
								class="transition-all mx-auto w-1 h-1 rounded group-hover:h-5
                       bg-[oklch(0.5_0.05_var(--hue))] group-hover:bg-(--primary) outline-4 z-50
                       outline-(--card-bg)
                       group-hover:outline-(--btn-plain-bg-hover)
                       group-active:outline-(--btn-plain-bg-active)"
							></div>
						</div>

						<!-- post title -->
						<div
							class="w-[70%] md:max-w-[65%] md:w-[65%] text-left font-bold
                     group-hover:translate-x-1 transition-all group-hover:text-(--primary)
                     text-75 pr-8 whitespace-nowrap text-ellipsis overflow-hidden"
						>
							{post.data.title}
						</div>

						<!-- tag list -->
						<div
							class="hidden md:block md:w-[15%] text-left text-sm transition
                     whitespace-nowrap text-ellipsis overflow-hidden text-30"
						>
							{formatTag(post.data.tags)}
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/each}
	{/if}
</div>

<style>
	.thought-bubble {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 1.5rem;
		padding: 0.75rem 1.5rem;
		color: rgb(64 64 64);
		background: var(--card-bg);
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.1);
	}

	:global(.dark) .thought-bubble {
		color: rgb(212 212 212);
	}

	.thought-text {
		font-size: 0.875rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.dot {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		border-radius: 50%;
		background: var(--card-bg);
	}

	.dot-1 {
		bottom: -8px;
		width: 12px;
		height: 12px;
	}

	.dot-2 {
		bottom: -18px;
		width: 8px;
		height: 8px;
	}

	.dot-3 {
		bottom: -25px;
		width: 5px;
		height: 5px;
	}
</style>
