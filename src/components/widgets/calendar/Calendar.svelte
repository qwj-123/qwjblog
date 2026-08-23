<script lang="ts">
import Icon from "@iconify/svelte";
import { onMount } from "svelte";

let dateCheckInterval: ReturnType<typeof setInterval> | null = null;

function updateTodayDate() {
	const now = new Date();
	todayYear = now.getFullYear();
	todayMonth = now.getMonth();
	todayDate = now.getDate();
}

import CalendarGrid from "./components/CalendarGrid.svelte";
import MonthPicker from "./components/MonthPicker.svelte";
import YearPicker from "./components/YearPicker.svelte";
import {
	formatDateKey,
	getCurrentPostId,
	getDaysInMonth,
	getFirstDayOfMonth,
	processPostsData,
} from "./hooks/useCalendar";
import type {
	CalendarGridCell,
	CalendarPost,
	CalendarStats,
} from "./types/calendar";

interface Props {
	monthNames: string[];
	weekDays: string[];
	yearSuffix: string;
}

const { monthNames, weekDays, yearSuffix }: Props = $props();

// State
let allPostsData: CalendarPost[] = $state([]);
let postDateMap: Record<string, CalendarPost[]> = $state({});
let stats: CalendarStats = $state({
	hasPostInYear: {},
	hasPostInMonth: {},
	minYear: new Date().getFullYear(),
	maxYear: new Date().getFullYear() + 5,
});

let currentYear = $state(new Date().getFullYear());
let currentMonth = $state(new Date().getMonth());
let selectedDateKey: string | null = $state(null);
let currentView: "day" | "month" | "year" = $state("day");

// Today's date (reactive, updates at midnight)
let todayYear = $state(new Date().getFullYear());
let todayMonth = $state(new Date().getMonth());
let todayDate = $state(new Date().getDate());

const isBackToTodayVisible = $derived(
	currentYear !== todayYear ||
		currentMonth !== todayMonth ||
		selectedDateKey !== null,
);

const emptyCellsCount = $derived(getFirstDayOfMonth(currentYear, currentMonth));

const cells = $derived(
	(() => {
		const daysInMonth = getDaysInMonth(currentYear, currentMonth);
		const result: CalendarGridCell[] = [];

		for (let day = 1; day <= daysInMonth; day++) {
			const dateKey = formatDateKey(currentYear, currentMonth, day);
			const posts = postDateMap[dateKey] || [];
			const isToday =
				currentYear === todayYear &&
				currentMonth === todayMonth &&
				day === todayDate;
			const isSelected = selectedDateKey === dateKey;

			result.push({
				day,
				dateKey,
				posts,
				hasPost: posts.length > 0,
				postCount: posts.length,
				isToday,
				isSelected,
				isEmpty: false,
			});
		}

		return result;
	})(),
);

// Functions
async function fetchCalendarData() {
	try {
		const res = await fetch("/api/calendar-data.json");
		const data = await res.json();
		if (Array.isArray(data)) {
			allPostsData = data;
			const processed = processPostsData(allPostsData);
			postDateMap = processed.postDateMap;
			stats = processed.stats;

			const currentPostIdValue = getCurrentPostId(
				window.location.pathname,
				allPostsData,
			);
			if (currentPostIdValue) {
				const matchedPost = allPostsData.find(
					(p) => p.id === currentPostIdValue,
				);
				if (matchedPost) {
					const [y, m] = matchedPost.date.split("-");
					currentYear = Number.parseInt(y, 10);
					currentMonth = Number.parseInt(m, 10) - 1;
				}
			}
		}
	} catch (error) {
		console.error("Failed to fetch calendar data:", error);
	}
}

function handlePrevMonth() {
	currentMonth--;
	if (currentMonth < 0) {
		currentMonth = 11;
		currentYear--;
	}
}

function handleNextMonth() {
	currentMonth++;
	if (currentMonth > 11) {
		currentMonth = 0;
		currentYear++;
	}
}

function handleBackToToday() {
	currentYear = todayYear;
	currentMonth = todayMonth;
	selectedDateKey = null;
	if (currentView !== "day") {
		closeSelectionPanel();
	}
}

function handleTitleClick() {
	if (currentView === "day") {
		showMonthPicker();
	} else if (currentView === "month") {
		showYearPicker();
	} else {
		closeSelectionPanel();
	}
}

function handleCellClick(dateKey: string) {
	if (selectedDateKey === dateKey) {
		selectedDateKey = null;
	} else {
		selectedDateKey = dateKey;
	}
}

function handleMonthSelect(month: number) {
	currentMonth = month;
	closeSelectionPanel();
}

function handleYearSelect(year: number) {
	currentYear = year;
	showMonthPicker();
}

function showMonthPicker() {
	currentView = "month";
}

function showYearPicker() {
	currentView = "year";
}

function closeSelectionPanel() {
	currentView = "day";
}

onMount(() => {
	fetchCalendarData();

	// Check for date change every minute
	dateCheckInterval = setInterval(() => {
		const now = new Date();
		if (
			now.getFullYear() !== todayYear ||
			now.getMonth() !== todayMonth ||
			now.getDate() !== todayDate
		) {
			updateTodayDate();
		}
	}, 60000);

	return () => {
		if (dateCheckInterval) {
			clearInterval(dateCheckInterval);
		}
	};
});
</script>

<div class="flex justify-between items-center mb-2 mt-2">
	<div
		class="font-bold transition text-lg text-neutral-900 dark:text-neutral-100 relative ml-4 flex items-center
			before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
			before:absolute before:left-[-16px] before:top-[13.5px]"
	>
		<button
			type="button"
			class="flex justify-center items-center cursor-pointer hover:bg-[var(--btn-plain-bg-hover)] px-2 py-2 -ml-2 rounded-lg transition-colors"
			onclick={handleTitleClick}
			aria-label="Select month or year"
		>
			<span
				class="text-lg font-bold text-neutral-900 dark:text-neutral-100 select-none"
			>
				{currentYear}{yearSuffix}
				{monthNames[currentMonth]}
			</span>
		</button>
	</div>

	<div class="flex items-center gap-1 shrink-0 ml-2">
		{#if isBackToTodayVisible}
			<button
				type="button"
				class="p-1.5 rounded-md hover:bg-[var(--btn-plain-bg-hover)] text-[var(--primary)] transition-all"
				onclick={handleBackToToday}
				aria-label="Back to today"
			>
				<Icon
					icon="material-symbols:restart-alt-rounded"
					class="text-xl"
				/>
			</button>
		{/if}
		<button
			type="button"
			class="p-1.5 rounded-md hover:bg-[var(--btn-plain-bg-hover)] text-neutral-600 dark:text-neutral-400 hover:text-[var(--primary)] transition-colors {currentView ===
			'day'
				? ''
				: 'invisible'}"
			onclick={handlePrevMonth}
			aria-label="Previous month"
		>
			<Icon icon="material-symbols:arrow-back-ios-new" class="text-lg" />
		</button>
		<button
			type="button"
			class="p-1.5 rounded-md hover:bg-[var(--btn-plain-bg-hover)] text-neutral-600 dark:text-neutral-400 hover:text-[var(--primary)] transition-colors {currentView ===
			'day'
				? ''
				: 'invisible'}"
			onclick={handleNextMonth}
			aria-label="Next month"
		>
			<Icon
				icon="material-symbols:arrow-back-ios-new"
				class="text-lg rotate-180"
			/>
		</button>
	</div>
</div>

<div class="relative w-full overflow-hidden" style="min-height: 15.625rem;">
	<div id="calendar-view" class="w-full opacity-100">
		<CalendarGrid
			{weekDays}
			{emptyCellsCount}
			{cells}
			onCellClick={handleCellClick}
		/>
	</div>

	{#if currentView === "month"}
		<div class="absolute inset-0 bg-[var(--card-bg)] z-10 flex flex-col">
			<MonthPicker
				{monthNames}
				{currentYear}
				{currentMonth}
				{stats}
				onMonthSelect={handleMonthSelect}
			/>
		</div>
	{:else if currentView === "year"}
		<div class="absolute inset-0 bg-[var(--card-bg)] z-10 flex flex-col">
			<YearPicker {currentYear} {stats} onYearSelect={handleYearSelect} />
		</div>
	{/if}
</div>
