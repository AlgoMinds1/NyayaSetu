"use client";
import {useEffect} from "react";
export function PwaRegister(){useEffect(()=>{
  if(!("serviceWorker" in navigator))return;
  // In development a service worker only gets in the way of hot reloading, so remove any left over from earlier runs.
  if(process.env.NODE_ENV!=="production"){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});return}
  navigator.serviceWorker.register("/sw.js").catch(()=>{});
},[]);return null}
