// Package middleware Gin 中间件.
package middleware

import (
	"net/http"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

// AuthRequired 要求用户已登录.
func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		sess := sessions.Default(c)
		if sess.Get("logged_in") != true {
			c.AbortWithStatusJSON(http.StatusUnauthorized,
				gin.H{"status": "error", "msg": "未登录"})
			return
		}
		c.Next()
	}
}
