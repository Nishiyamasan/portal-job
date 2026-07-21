FROM golang:1.22-alpine AS build

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/portal-job-api ./cmd/api

FROM alpine:3.20

RUN adduser -D -H -u 10001 appuser
USER appuser

COPY --from=build /out/portal-job-api /usr/local/bin/portal-job-api

EXPOSE 10001

ENTRYPOINT ["/usr/local/bin/portal-job-api"]
