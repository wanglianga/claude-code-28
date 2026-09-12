<script setup lang="ts">
import { computed } from 'vue';

interface Point { label: string; value: number; hint?: string }

const props = withDefaults(defineProps<{
  points: Point[];
  goal?: number | null;
  max?: number;
  height?: number;
  color?: string;
}>(), { max: 5, height: 220, color: '#e07856' });

const W = 720;
const padL = 34, padR = 16, padT = 18, padB = 34;

const innerW = W - padL - padR;
const innerH = computed(() => props.height - padT - padB);

function x(i: number) {
  if (props.points.length <= 1) return padL + innerW / 2;
  return padL + (i / (props.points.length - 1)) * innerW;
}
function y(v: number) {
  return padT + innerH.value - (v / props.max) * innerH.value;
}

const polyline = computed(() =>
  props.points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '));

const goalY = computed(() => (props.goal != null ? y(props.goal) : null));

const ticks = [1, 2, 3, 4, 5];
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${height}`" style="width:100%; height:auto; display:block;">
    <line v-for="t in ticks" :key="t" :x1="padL" :x2="W - padR" :y1="y(t)" :y2="y(t)" stroke="#eee6d8" stroke-width="1" />
    <text v-for="t in ticks" :key="'tt' + t" :x="padL - 8" :y="y(t)" text-anchor="end" dominant-baseline="middle" font-size="11" fill="#a39a8e">{{ t }}</text>
    <line v-if="goalY !== null" :x1="padL" :x2="W - padR" :y1="goalY" :y2="goalY"
      stroke="#2f6f6a" stroke-width="1.6" stroke-dasharray="6 4" />
    <text v-if="goalY !== null && goal != null" :x="W - padR" :y="goalY - 6" text-anchor="end" font-size="11.5" fill="#2f6f6a">同龄段目标 {{ goal }}</text>
    <polyline v-if="points.length > 1" :points="polyline" fill="none" :stroke="color" stroke-width="2.5" stroke-linejoin="round" />
    <g v-for="(p, i) in points" :key="i">
      <circle :cx="x(i)" :cy="y(p.value)" r="4.5" :fill="color" stroke="#fffdf7" stroke-width="2">
        <title>{{ p.label }}：{{ p.value }}分{{ p.hint ? '（' + p.hint + '）' : '' }}</title>
      </circle>
      <text :x="x(i)" :y="height - 18" text-anchor="middle" font-size="10.5" fill="#a39a8e">{{ p.label }}</text>
      <text v-if="p.hint" :x="x(i)" :y="height - 6" text-anchor="middle" font-size="9.5" fill="#c8bfb1">{{ p.hint }}</text>
    </g>
  </svg>
</template>
