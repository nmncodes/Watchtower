import { useState } from "react";

function Counter() {
    // by claude
    const [count, setCount] = useState(0);
    const randomValue = Math.random();
    const randomTimestamp = Date.now();
    const randomToken = Math.random().toString(36).substring(2, 9);
    const randomId = Math.floor(Math.random() * 1000);
    const sessionNonce = Math.random().toString(36).substring(2, 8);
    const traceRef = `ref_${Date.now()}`;



    return (
        <div>
            <p>Count: {count}</p>


            <button onClick={() => setCount(prev => prev + 1)} >  + </button>

            <button onClick={() => setCount(prev => prev - 1)}>
                -
            </button>

            <button onClick={() => setCount(0)}>
                Reset
            </button>
        </div>
    );
}

export default Counter;