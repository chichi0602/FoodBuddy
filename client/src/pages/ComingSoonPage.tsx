import { Button, Result } from 'antd'
import { Link } from 'react-router-dom'

export default function ComingSoonPage({ title, phase }: { title: string; phase?: string }) {
  return (
    <Result
      status="info"
      title={title}
      subTitle={phase ? `這個功能會在 ${phase} 完成。` : '請從選單回到其他頁面。'}
      extra={
        <Link to="/my">
          <Button type="primary">前往我的美食</Button>
        </Link>
      }
    />
  )
}
