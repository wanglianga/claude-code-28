<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api';
import { useAuthStore } from '../../stores/auth';
import type { OverviewRow } from '../../types';

const auth = useAuthStore();
const router = useRouter();
const rows = ref<OverviewRow[]>([]);
const loading = ref(true);
const classFilter = ref('');
const riskOnly = ref(false);

onMounted(async () => {
  try {
    rows.value = await api('/api/supervisor/overview');
  } catch {
    /* 请求中断可忽略 */
  } finally {
    loading.value = false;
  }
});

const classNames = computed(() => [...new Set(rows.value.map((r) => r.class_name))]);
const filtered = computed(() =>
  rows.value.filter((r) =>
    (!classFilter.value || r.class_name === classFilter.value) &&
    (!riskOnly.value || r.flags.some((f) => f.level !== 'ok'))));

const decisionLabel = computed(() => {
  const map: Record<string, string> = {};
  (auth.meta?.decisions || []).forEach((d) => { map[d.key] = d.label; });
  return (k?: string) => (k ? map[k] || k : '未评估');
});

const dangerCount = computed(() =>
  rows.value.filter((r) => r.flags.some((f) => f.level === 'danger')).length);

function trendText(r: OverviewRow): string {
  if (r.trend === null) return '—';
  const sign = r.trend > 0 ? '+' : '';
  return `${r.first_avg} → ${r.last_avg}（${sign}${r.trend}）`;
}
</script>

<template>
  <div>
    <div class="flex-between flex-wrap mb">
      <div>
        <h1 style="margin:0">教学总览</h1>
        <div class="muted small mt">教学证据与商业续费分栏呈现，一致性异常自动标出</div>
      </div>
      <div class="flex">
        <span v-if="dangerCount" class="chip chip-danger">{{ dangerCount }} 名学生存在高风险</span>
        <select v-model="classFilter" class="select" style="width:140px">
          <option value="">全部班级</option>
          <option v-for="c in classNames" :key="c" :value="c">{{ c }}</option>
        </select>
        <label class="flex small" style="gap:6px; cursor:pointer;">
          <input type="checkbox" v-model="riskOnly" /> 只看有提示的
        </label>
      </div>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else class="card" style="overflow-x:auto;">
      <table class="table" style="min-width:1080px;">
        <thead>
          <tr>
            <th colspan="3" style="border-bottom-color:var(--teal); color:var(--teal);">教学证据区</th>
            <th colspan="3" style="border-bottom-color:var(--gold); color:var(--warn);">商业与风险区</th>
            <th></th>
          </tr>
          <tr>
            <th>学生</th>
            <th>成长趋势（六维均分）</th>
            <th>出勤 / 作业</th>
            <th>课时消耗</th>
            <th>续费建议</th>
            <th>沟通风险</th>
            <th>一致性提示</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filtered" :key="r.id" class="clickable" @click="router.push(`/supervisor/student/${r.id}`)">
            <td>
              <b>{{ r.name }}</b>
              <div class="small faint">{{ r.class_name }} · {{ r.teacher_name }}</div>
            </td>
            <td>
              <span :class="{ 'trend-up': (r.trend ?? 0) >= 0.3, 'trend-down': (r.trend ?? 0) < 0 }">{{ trendText(r) }}</span>
              <div class="small faint">最近评估：{{ decisionLabel(r.latest_eval?.decision) }}</div>
            </td>
            <td>
              {{ r.attendance_rate }}%
              <span class="faint">/</span>
              {{ r.homework_rate === null ? '—' : r.homework_rate + '%' }}
            </td>
            <td>
              {{ r.hours_consumed }}/{{ r.hours_consumed + r.hours_remaining }}
              <div class="small faint">剩余 {{ r.hours_remaining }}</div>
            </td>
            <td>
              <span v-if="r.latest_renewal" class="chip chip-gold">{{ r.latest_renewal.package || '有' }}</span>
              <span v-else class="faint">—</span>
            </td>
            <td>
              <span class="chip" :class="r.comm_risk === 'high' ? 'chip-danger' : r.comm_risk === 'medium' ? 'chip-gold' : 'chip-ok'">
                {{ r.comm_risk === 'high' ? '高' : r.comm_risk === 'medium' ? '中' : '低' }}
              </span>
            </td>
            <td style="max-width:300px;">
              <div class="flex flex-wrap" style="gap:4px;">
                <span v-for="(f, i) in r.flags" :key="i" class="chip"
                  :class="f.level === 'danger' ? 'chip-danger' : f.level === 'warn' ? 'chip-gold' : 'chip-ok'">
                  {{ f.text }}
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="small faint mt">点击学生行进入详情：成长轨迹 / 升班评估 / 事件时间线 / 阶段说明 / 续费与风险。</p>
  </div>
</template>

<style scoped>
.trend-up { color: var(--ok); font-weight: 600; }
.trend-down { color: var(--danger); font-weight: 600; }
</style>
