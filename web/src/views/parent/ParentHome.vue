<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, fmtDate } from '../../api';
import type { StudentSummary, Trajectory, ReviewItem, StageReport } from '../../types';
import GrowthPanel from '../../components/GrowthPanel.vue';
import ScoreDots from '../../components/ScoreDots.vue';

const students = ref<StudentSummary[]>([]);
const studentId = ref<number | null>(null);
const tab = ref<'latest' | 'growth' | 'report'>('latest');
const loading = ref(true);

const trajectory = ref<Trajectory | null>(null);
const reports = ref<StageReport[]>([]);
const activeReport = ref<StageReport | null>(null);

const current = computed(() => students.value.find((s) => s.id === studentId.value));
const doPrint = () => window.print();
const latest = computed<ReviewItem | null>(() => {
  const list = trajectory.value?.reviews || [];
  return list.length ? list[list.length - 1] : null;
});
const dims = computed(() => trajectory.value?.dimensions || []);

async function loadStudent() {
  if (!studentId.value) return;
  trajectory.value = null;
  const [t, r] = await Promise.all([
    api<Trajectory>(`/api/students/${studentId.value}/trajectory`),
    api<StageReport[]>(`/api/students/${studentId.value}/stage-reports`),
  ]);
  trajectory.value = t;
  reports.value = r;
}

onMounted(async () => {
  students.value = await api('/api/students');
  if (students.value.length) studentId.value = students.value[0].id;
  loading.value = false;
});
watch(studentId, loadStudent);
</script>

<template>
  <div>
    <div v-if="loading" class="loading">加载中...</div>
    <template v-else-if="current">
      <div class="flex-between flex-wrap mb">
        <div>
          <h1 style="margin:0">{{ current.name }} 的课堂</h1>
          <div class="muted small mt">{{ current.class_name }} · {{ current.class_stage }} · 任课老师：{{ current.teacher_name }}</div>
        </div>
        <select v-if="students.length > 1" v-model="studentId" class="select" style="width:150px">
          <option v-for="s in students" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>

      <div class="alert alert-info mb small">
        本页展示的是<b>教学内容</b>（作品、点评、阶段说明）。课程顾问的续费建议在
        <RouterLink to="/parent/renewals"><b>「续费建议」</b></RouterLink>
        页面单独展示，与老师的教学评价相互独立。
      </div>

      <div class="tabs">
        <button class="tab" :class="{ active: tab === 'latest' }" @click="tab = 'latest'">本次点评</button>
        <button class="tab" :class="{ active: tab === 'growth' }" @click="tab = 'growth'">成长轨迹</button>
        <button class="tab" :class="{ active: tab === 'report' }" @click="tab = 'report'">阶段说明</button>
      </div>

      <!-- 本次点评 -->
      <div v-if="tab === 'latest'">
        <div v-if="!trajectory" class="loading">加载中...</div>
        <div v-else-if="!latest" class="empty">还没有点评记录，老师会在每次课后上传</div>
        <div v-else class="grid" style="grid-template-columns: 1.1fr 1fr;">
          <div class="card">
            <img :src="latest.image_path" style="width:100%; border-radius:12px; border:1px solid var(--line);" />
            <div class="mt small muted">{{ fmtDate(latest.lesson_date) }} · {{ latest.theme }}</div>
          </div>
          <div class="card">
            <div class="flex-between">
              <h3 style="margin:0">《{{ latest.title }}》</h3>
              <span class="chip chip-teal">{{ latest.stage }}</span>
            </div>
            <table class="table mt">
              <tbody>
                <tr v-for="d in dims" :key="d.key">
                  <td style="width:90px">{{ d.label }}</td>
                  <td><ScoreDots :score="(latest as any)[d.key]" /></td>
                  <td class="muted" style="width:44px">{{ (latest as any)[d.key] }}分</td>
                </tr>
              </tbody>
            </table>
            <div class="mt small">
              <p><b>老师建议：</b>{{ latest.suggestion }}</p>
              <p v-if="latest.next_prep"><b>下次课准备：</b>{{ latest.next_prep }}</p>
              <p v-if="latest.class_state"><b>课堂状态：</b>{{ latest.class_state }}</p>
            </div>
            <div class="mt">
              <span class="chip" :class="latest.need_home_practice ? 'chip-gold' : 'chip-ok'">
                {{ latest.need_home_practice ? '需要家庭练习' : '本节课无需家庭练习' }}
              </span>
            </div>
            <p v-if="latest.home_practice_note" class="small muted">{{ latest.home_practice_note }}</p>
            <div class="mt">
              <RouterLink to="/parent/questions" class="btn btn-teal btn-sm">对本次点评有疑问？向老师提问</RouterLink>
            </div>
          </div>
        </div>
      </div>

      <!-- 成长轨迹 -->
      <div v-if="tab === 'growth'">
        <GrowthPanel :student-id="current.id" :key="current.id" />
      </div>

      <!-- 阶段说明 -->
      <div v-if="tab === 'report'">
        <div v-if="!reports.length" class="empty">阶段说明会在家长会前由老师生成，敬请期待</div>
        <div v-for="r in reports" :key="r.id" class="card">
          <div class="flex-between">
            <div>
              <b>{{ r.period }}</b>
              <span class="faint small" style="margin-left:10px">{{ fmtDate(r.created_at) }} 生成 · {{ r.generated_by_name }}</span>
            </div>
            <button class="btn btn-ghost btn-sm" @click="activeReport = r">查看全文</button>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="empty">暂无孩子信息</div>

    <div v-if="activeReport" class="modal-mask" @click.self="activeReport = null">
      <div class="modal modal-lg">
        <div class="flex-between mb no-print">
          <h3 style="margin:0">阶段学习说明</h3>
          <div class="flex">
            <button class="btn btn-ghost btn-sm" @click="doPrint">打印</button>
            <button class="btn btn-ghost btn-sm" @click="activeReport = null">关闭</button>
          </div>
        </div>
        <div class="report-body">{{ activeReport.content }}</div>
      </div>
    </div>
  </div>
</template>
