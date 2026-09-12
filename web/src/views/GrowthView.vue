<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';
import type { StudentSummary } from '../types';
import GrowthPanel from '../components/GrowthPanel.vue';

const route = useRoute();
const students = ref<StudentSummary[]>([]);
const studentId = ref<number | null>(null);
const classFilter = ref('');
const loading = ref(true);

onMounted(async () => {
  students.value = await api('/api/students');
  const fromQuery = Number(route.query.student);
  if (fromQuery && students.value.some((s) => s.id === fromQuery)) {
    studentId.value = fromQuery;
  } else if (students.value.length) {
    studentId.value = students.value[0].id;
  }
  loading.value = false;
});

const classNames = computed(() => [...new Set(students.value.map((s) => s.class_name))]);
const filteredStudents = computed(() =>
  students.value.filter((s) => !classFilter.value || s.class_name === classFilter.value));

const current = computed(() => students.value.find((s) => s.id === studentId.value));

function pickClass() {
  if (filteredStudents.value.length && !filteredStudents.value.some((s) => s.id === studentId.value)) {
    studentId.value = filteredStudents.value[0].id;
  }
}
</script>

<template>
  <div>
    <div class="flex-between flex-wrap mb">
      <h1 style="margin:0">作品成长轨迹</h1>
      <div class="flex flex-wrap">
        <select v-model="classFilter" class="select" style="width:150px" @change="pickClass">
          <option value="">全部班级</option>
          <option v-for="c in classNames" :key="c" :value="c">{{ c }}</option>
        </select>
        <select v-model="studentId" class="select" style="width:170px">
          <option v-for="s in filteredStudents" :key="s.id" :value="s.id">{{ s.name }}（{{ s.class_name }}）</option>
        </select>
      </div>
    </div>
    <div v-if="loading" class="loading">加载中...</div>
    <template v-else-if="current">
      <div class="flex flex-wrap mb" style="gap:8px;">
        <span class="chip chip-ink">{{ current.class_name }} · {{ current.class_stage }}</span>
        <span class="chip chip-teal">任课：{{ current.teacher_name }}</span>
        <span class="chip">课时 {{ current.hours_consumed }}/{{ current.hours_purchased }}</span>
        <span class="chip" :class="current.child_willingness === '积极' ? 'chip-ok' : ''">孩子意愿：{{ current.child_willingness }}</span>
      </div>
      <GrowthPanel :student-id="current.id" :key="current.id" />
    </template>
    <div v-else class="empty">暂无学生数据</div>
  </div>
</template>
