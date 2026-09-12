<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { api, fmtDateTime } from '../../api';
import type { Renewal, StudentSummary } from '../../types';

const students = ref<StudentSummary[]>([]);
const studentId = ref<number | null>(null);
const renewals = ref<Renewal[]>([]);
const loading = ref(true);

onMounted(async () => {
  students.value = await api('/api/students');
  if (students.value.length) studentId.value = students.value[0].id;
  loading.value = false;
});

watch(studentId, async (id) => {
  if (!id) return;
  renewals.value = await api(`/api/students/${id}/renewals`);
});
</script>

<template>
  <div>
    <h1>续费建议</h1>

    <div class="alert alert-gold mb">
      <b>请先了解：</b>本页内容为课程顾问的<b>商业续费建议</b>，与老师的教学评价、升班评估<b>相互独立</b>。
      续费建议不代表孩子达到了升班标准，孩子的学情请以
      <RouterLink to="/parent"><b>「孩子的课堂」</b></RouterLink>
      中的作品点评与阶段说明为准。是否升班由教学主管的正式评估决定。
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <template v-else>
      <div v-if="students.length > 1" class="mb">
        <select v-model="studentId" class="select" style="width:160px">
          <option v-for="s in students" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>

      <div class="section-band band-biz">
        <span class="band-label">商业沟通区 · 与教学证据分开呈现</span>
        <div class="band-body">
          <div v-if="!renewals.length" class="empty">暂无续费建议</div>
          <div v-for="r in renewals" :key="r.id" class="card" style="box-shadow:none;">
            <div class="flex-between flex-wrap">
              <span class="chip chip-gold">{{ r.package || '续费建议' }}</span>
              <span class="faint small">{{ r.author_name }} · {{ fmtDateTime(r.created_at) }}</span>
            </div>
            <p style="margin:10px 0 0">{{ r.suggestion }}</p>
          </div>
        </div>
      </div>

      <div class="card mt">
        <h3>常见问题</h3>
        <p class="small"><b>Q：顾问建议续费，是不是说明孩子该升班了？</b><br />
          A：不是。续费建议基于课时消耗与课程安排，升班由教学主管结合作品成长、出勤、作业、孩子意愿等综合评估，两者独立。</p>
        <p class="small"><b>Q：在哪里看教学方面的正式结论？</b><br />
          A：家长会前老师会为每个孩子生成「阶段说明」，升班评估结论会在家长会上由教学主管当面说明。</p>
      </div>
    </template>
  </div>
</template>
