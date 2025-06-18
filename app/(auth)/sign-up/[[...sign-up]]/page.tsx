import { SignUp } from '@clerk/nextjs'

export default function Page() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <SignUp 
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-lg"
          }
        }}
        routing="path" 
        path="/sign-up"
      />
    </div>
  )
}