<script setup lang="ts">
import { computed } from 'vue';

interface Serie { name: string; values: number[]; color: string; dashed?: boolean }

const props = withDefaults(defineProps<{
  labels: string[];
  series: Serie[];
  max?: number;
  size?: number;
}>(), { max: 5, size: 300 });

const cx = computed(() => props.size / 2);
const cy = computed(() => props.size / 2);
const R = computed(() => props.size / 2 - 46);

function point(i: number, value: number) {
  const angle = (Math.PI * 2 * i) / props.labels.length - Math.PI / 2;
  const r = (value / props.max) * R.value;
  return [cx.value + r * Math.cos(angle), cy.value + r * Math.sin(angle)];
}

function polygon(values: number[]): string {
  return values.map((v, i) => point(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');
}

const rings = computed(() => [1, 2, 3, 4, 5].map((v) => polygon(Array(props.labels.length).fill(v))));

function labelPos(i: number) {
  const angle = (Math.PI * 2 * i) / props.labels.length - Math.PI / 2;
  const r = R.value + 26;
  return {
    x: cx.value + r * Math.cos(angle),
    y: cy.value + r * Math.sin(angle),
    anchor: Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end',
  };
}
</script>

<template>
  <div class="radar-wrap">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <polygon v-for="(ring, i) in rings" :key="i" :points="ring" fill="none" stroke="#e8e0d3" stroke-width="1" />
      <line v-for="(label, i) in labels" :key="label"
        :x1="cx" :y1="cy" :x2="point(i, max)[0]" :y2="point(i, max)[1]"
        stroke="#e8e0d3" stroke-width="1" />
      <polygon v-for="s in series" :key="s.name" :points="polygon(s.values)"
        :fill="s.color + '2e'" :stroke="s.color" stroke-width="2"
        :stroke-dasharray="s.dashed ? '5 4' : undefined" />
      <text v-for="(label, i) in labels" :key="'t' + label"
        :x="labelPos(i).x" :y="labelPos(i).y" :text-anchor="labelPos(i).anchor"
        font-size="12.5" fill="#6f675e" dominant-baseline="middle">{{ label }}</text>
    </svg>
    <div class="flex flex-wrap small" style="justify-content:center; gap:14px;">
      <span v-for="s in series" :key="s.name" class="flex" style="gap:5px;">
        <span :style="{ width: '12px', height: '12px', borderRadius: '3px', background: s.color, display: 'inline-block' }"></span>
        {{ s.name }}
      </span>
    </div>
  </div>
</template>
