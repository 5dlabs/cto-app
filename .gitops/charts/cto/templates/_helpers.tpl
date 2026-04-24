{{/*
CTO Platform - Shared Helm Helpers
*/}}

{{- define "cto.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "cto.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s" $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "cto.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "cto.labels" -}}
helm.sh/chart: {{ include "cto.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: cto-platform
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{- define "cto.namespace" -}}
{{- ((.Values.global).namespace) | default .Release.Namespace }}
{{- end }}

{{- define "cto.imagePullSecrets" -}}
{{- with ((.Values.global).imagePullSecrets) }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}

{{/* Controller */}}
{{- define "cto.controller.fullname" -}}
{{- printf "%s-controller" (include "cto.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "cto.controller.labels" -}}
{{ include "cto.labels" . }}
app.kubernetes.io/name: controller
{{- end }}

{{- define "cto.controller.selectorLabels" -}}
app.kubernetes.io/name: controller
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "cto.controller.serviceAccountName" -}}
{{- include "cto.controller.fullname" . }}
{{- end }}

{{/* Tools */}}
{{- define "cto.tools.fullname" -}}
{{- printf "%s-tools" (include "cto.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "cto.tools.labels" -}}
{{ include "cto.labels" . }}
app.kubernetes.io/name: tools
{{- end }}

{{- define "cto.tools.selectorLabels" -}}
app.kubernetes.io/name: tools
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "cto.tools.serviceAccountName" -}}
{{- include "cto.tools.fullname" . }}
{{- end }}

{{/* Per-tool-server secret name */}}
{{- define "cto.tools.serverSecretName" -}}
{{- printf "%s-%s" (include "cto.tools.fullname" .root) .name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Workflow / agent pod helpers (referenced by agent-templates ConfigMap consumers) */}}
{{- define "platform.agentVolumeMounts" -}}
- name: workspace
  mountPath: /workspace
- name: tmp
  mountPath: /tmp
{{- end }}

{{- define "platform.agentVolumes" -}}
- name: workspace
  emptyDir: {}
- name: tmp
  emptyDir: {}
{{- end }}
