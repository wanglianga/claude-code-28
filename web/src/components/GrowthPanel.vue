<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, fmtDate } from '../api';
import type { Trajectory, ReviewItem } from '../types';
import RadarChart from './RadarChart.vue';
import TrendChart from './TrendChart.vue';
import ScoreDots from './ScoreDots.vue';

const props = defineProps<{ studentId: number }>();

const data = ref<Trajectory | null>(null);
const loading = ref(true);
const error = ref('');

const dimKey = ref('avg');       // avg 或具体维度
const themeFilter = ref('');
const stageFilter = ref('');
const active = ref<ReviewItem | null>(null);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await api<Trajectory>(`/api/students/${props.studentId}/trajectory`);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
watch(() => props.studentId, load, { immediate: true });

const dims = computed(() => data.value?.dimensions || []);
const dimLabel = (k: string) => dims.value.find((d) => d.key === k)?.label || k;

const themes = computed(() => [...new Set((data.value?.reviews || []).map((r) => r.theme))]);
const stages = computed(() => [...new Set((data.value?.reviews || []).map((r) => r.stage))]);

const filtered = computed(() =>
  (data.value?.reviews || []).filter((r) =>
    (!themeFilter.value || r.theme === themeFilter.value) &&
    (!stageFilter.value || r.stage === stageFilter.value)));

function scoreOf(r: ReviewItem, key: string): number {
  if (key === 'avg') {
    return Math.round((r.composition + r.line_score + r.color + r.observation + r.creativity + r.focus) / 6 * 10) / 10;
  }
  return (r as any)[key] ?? 0;
}

const trendPoints = computed(() =>
  filtered.value.map((r) => ({
    label: fmtDate(r.lesson_date).slice(5),
    value: scoreOf(r, dimKey.value),
    hint: r.theme.replace(/[《》]/g, '').slice(0, 6),
  })));

const goalForDim = computed(() => {
  if (!data.value || dimKey.value === 'avg') {
    if (!data.value?.goals.length) return null;
    const t = data.value!.goals.reduce((s, g) => s + g.target_score, 0) / data.value!.goals.length;
    return Math.round(t * 10) / 10;
  }
  return data.value.goals.find((g) => g.dimension === dimKey.value)?.target_score ?? null;
});

function avgDim(list: ReviewItem[], key: string): number {
  if (!list.length) return 0;
  return Math.round(list.reduce((s, r) => s + (r as any)[key], 0) / list.length * 10) / 10;
}

const radarSeries = computed(() => {
  if (!data.value) return [];
  const all = data.value.reviews;
  const first = all.slice(0, 4);
  const last = all.slice(-4);
  const goalValues = dims.value.map((d) => data.value!.goals.find((g) => g.dimension === d.key)?.target_score ?? 0);
  const series = [
    {
      name: `最近${last.length}次平均`,
      values: dims.value.map((d) => avgDim(last, d.key)),
      color: '#e07856',
    },
    {
      name: '同龄段阶段目标',
      values: goalValues,
      color: '#2f6f6a',
      dashed: true,
    },
  ];
  if (first.length && all.length > 4) {
    series.push({
      name: `最初${first.length}次平均`,
      values: dims.value.map((d) => avgDim(first, d.key)),
      color: '#a39a8e',
      dashed: true,
    });
  }
  return series;
});

const radarLabels = computed(() => dims.value.map((d) => d.label));
</script>

<template>
  <div>
    <div v-if="loading" class="loading">加载成长轨迹...</div>
    <div v-else-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-else-if="data">
      <div v-if="!data.reviews.length" class="empty">还没有作品点评记录</div>
      <template v-else>
        <div class="grid grid-2">
          <div class="card">
            <h3>能力雷达 · 与同龄段阶段目标对照</h3>
            <RadarChart :labels="radarLabels" :series="radarSeries" :size="320" />
          </div>
          <div class="card">
            <div class="flex-between mb">
              <h3 style="margin:0">成长趋势</h3>
              <select v-model="dimKey" class="select" style="width:130px">
                <option value="avg">综合均分</option>
                <option v-for="d in dims" :key="d.key" :value="d.key">{{ d.label }}</option>
              </select>
            </div>
            <TrendChart :points="trendPoints" :goal="goalForDim" />
            <div class="small faint mt">虚线为同龄段阶段目标分； hover 数据点可查看课程主题。</div>
          </div>
        </div>

        <div class="card">
          <div class="flex-between flex-wrap mb">
            <h3 style="margin:0">作品与点评（{{ filtered.length }}）</h3>
            <div class="flex flex-wrap">
              <select v-model="themeFilter" class="select" style="width:200px">
                <option value="">全部课程主题</option>
                <option v-for="t in themes" :key="t" :value="t">{{ t }}</option>
              </select>
              <select v-model="stageFilter" class="select" style="width:150px">
                <option value="">全部阶段目标</option>
                <option v-for="s in stages" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
          </div>
          <div class="art-grid">
            <div v-for="r in filtered" :key="r.id" class="art-card" @click="active = r">
              <img :src="r.image_path" :alt="r.title" loading="lazy" />
              <div class="art-meta">
                <div class="art-title">{{ r.title }}</div>
                <div class="faint">{{ fmtDate(r.lesson_date) }} · {{ r.stage }}</div>
                <div class="flex" style="margin-top:4px; gap:6px;">
                  <ScoreDots :score="Math.round(scoreOf(r, 'avg'))" />
                  <span class="small faint">{{ scoreOf(r, 'avg') }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 单次点评详情 -->
    <div v-if="active" class="modal-mask" @click.self="active = null">
      <div class="modal modal-lg">
        <div class="flex-between mb">
          <h3 style="margin:0">{{ active.title }} <span class="chip chip-teal">{{ active.stage }}</span></h3>
          <button class="btn btn-ghost btn-sm" @click="active = null">关闭</button>
        </div>
        <div class="grid" style="grid-template-columns: 1.1fr 1fr;">
          <div>
            <img :src="active.image_path" style="width:100%; border-radius:12px; border:1px solid var(--line);" />
            <div class="small faint mt">{{ fmtDate(active.lesson_date) }} · {{ active.theme }} · 点评老师：{{ active.teacher_name }}</div>
          </div>
          <div>
            <table class="table">
              <tbody>
                <tr v-for="d in dims" :key="d.key">
                  <td style="width:90px">{{ d.label }}</td>
                  <td><ScoreDots :score="(active as any)[d.key]" /></td>
                  <td style="width:40px" class="muted">{{ (active as any)[d.key] }}分</td>
                </tr>
              </tbody>
            </table>
            <div class="mt">
              <div class="chip" :class="active.need_home_practice ? 'chip-gold' : 'chip-ok'">
                {{ active.need_home_practice ? '需要家庭练习' : '本节课无需家庭练习' }}
              </div>
            </div>
            <div class="mt small">
              <p><b>老师建议：</b>{{ active.suggestion }}</p>
              <p v-if="active.next_prep"><b>下次课准备：</b>{{ active.next_prep }}</p>
              <p v-if="active.class_state"><b>课堂状态：</b>{{ active.class_state }}</p>
              <p v-if="active.home_practice_note"><b>家庭练习：</b>{{ active.home_practice_note }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
