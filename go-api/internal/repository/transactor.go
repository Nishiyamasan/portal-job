package repository

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Transactor interface {
	WithinTransaction(context.Context, func(context.Context) error) error
}

type pgxTransactor struct {
	pool *pgxpool.Pool
}

type txKey struct{}

func NewTransactor(pool *pgxpool.Pool) Transactor {
	return &pgxTransactor{pool: pool}
}

func InjectTx(ctx context.Context, tx pgx.Tx) context.Context {
	return context.WithValue(ctx, txKey{}, tx)
}

func ExtractTx(ctx context.Context) pgx.Tx {
	if tx, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return tx
	}
	return nil
}

func (t *pgxTransactor) WithinTransaction(ctx context.Context, fn func(context.Context) error) error {
	tx, err := t.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	ctxWithTx := InjectTx(ctx, tx)

	if err := fn(ctxWithTx); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func GetDB(ctx context.Context, pool *pgxpool.Pool) DBTX {
	if tx := ExtractTx(ctx); tx != nil {
		return tx
	}
	return pool
}
