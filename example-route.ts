// 示例路由文件：演示新的 resolvePath 功能
// 文件位置：servers/routes/users/[id:number]/posts/[[slug:slug]].get.ts

export default () => {
  return {
    message: '这是一个带类型约束的动态路由',
    route: '/users/[id:number]/posts/[[slug:slug]]',
    description: {
      id: '必须是数字类型的用户ID',
      slug: '可选的 slug 参数，只允许字母、数字和连字符',
    },
    examples: {
      valid: [
        '/users/123/posts',
        '/users/456/posts/my-blog-post',
        '/users/789/posts/hello-world-2024',
      ],
      invalid: [
        '/users/abc/posts', // id 不是数字
        '/users/123/posts/Hello World', // slug 包含空格和大写字母
      ],
    },
  }
}
