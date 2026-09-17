@echo off
echo ========================================
echo   服装设计素材库 - 本地服务器启动
echo ========================================
echo.
echo 启动中...
echo.

cd /d "%~dp0"

:: 检查 Python
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo 使用 Python 启动...
    echo 访问地址: http://localhost:8080
    echo.
    echo 按 Ctrl+C 停止服务器
    echo.
    python -m http.server 8080
) else (
    python3 --version >nul 2>&1
    if %errorlevel% == 0 (
        echo 使用 Python3 启动...
        echo 访问地址: http://localhost:8080
        echo.
        echo 按 Ctrl+C 停止服务器
        echo.
        python3 -m http.server 8080
    ) else (
        echo 错误: 未找到 Python
        echo 请安装 Python 后重试
        echo 下载地址: https://www.python.org/downloads/
        echo.
        pause
    )
)
