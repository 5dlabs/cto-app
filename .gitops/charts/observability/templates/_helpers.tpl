{{/*
Expand the name of the chart.
*/}}
{{- define "observability.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "observability.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Chart label value.
*/}}
{{- define "observability.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels.
*/}}
{{- define "observability.labels" -}}
helm.sh/chart: {{ include "observability.chart" . }}
{{ include "observability.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: cto
{{- end -}}

{{/*
Selector labels.
*/}}
{{- define "observability.selectorLabels" -}}
app.kubernetes.io/name: {{ include "observability.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Namespace for all namespaced resources.
*/}}
{{- define "observability.namespace" -}}
{{- default .Release.Namespace .Values.namespace -}}
{{- end -}}

{{/*
Promtail service account name.
*/}}
{{- define "observability.promtailServiceAccountName" -}}
{{- if .Values.promtail.serviceAccount.create -}}
{{- default (printf "%s-promtail" (include "observability.fullname" .)) .Values.promtail.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.promtail.serviceAccount.name -}}
{{- end -}}
{{- end -}}
