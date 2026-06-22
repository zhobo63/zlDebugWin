cmake_minimum_required(VERSION 3.14)
project(zlDebugServer LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# libhv as subdirectory: static only, MT runtime on Windows
if(MSVC)
    set(BUILD_FOR_MT ON CACHE BOOL "build for /MT")
endif()
set(BUILD_SHARED OFF CACHE BOOL "disable shared library")
set(BUILD_STATIC ON  CACHE BOOL "enable static library")
add_subdirectory(libhv EXCLUDE_FROM_ALL)

set(LIBHV_SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/libhv)

add_executable(${PROJECT_NAME} server.cpp)

target_include_directories(${PROJECT_NAME} PRIVATE
    ${LIBHV_SOURCE_DIR}
    ${LIBHV_SOURCE_DIR}/include
    ${LIBHV_SOURCE_DIR}/base
    ${LIBHV_SOURCE_DIR}/ssl
    ${LIBHV_SOURCE_DIR}/event
    ${LIBHV_SOURCE_DIR}/util
    ${LIBHV_SOURCE_DIR}/cpputil
    ${LIBHV_SOURCE_DIR}/evpp
    ${LIBHV_SOURCE_DIR}/http
    ${LIBHV_SOURCE_DIR}/http/server
    ${LIBHV_SOURCE_DIR}/http/client
)

target_link_libraries(${PROJECT_NAME} PRIVATE hv_static)

if(MSVC)
    target_compile_options(${PROJECT_NAME} PRIVATE /utf-8)
endif()
