FROM golang:1.22-alpine AS build

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/portal-job-worker ./cmd/worker

FROM alpine:3.20

RUN adduser -D -H -u 10001 appuser
USER appuser

COPY --from=build /out/portal-job-worker /usr/local/bin/portal-job-worker

ENTRYPOINT ["/usr/local/bin/portal-job-worker"]
