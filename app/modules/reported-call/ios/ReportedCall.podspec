Pod::Spec.new do |s|
  s.name           = 'ReportedCall'
  s.version        = '1.0.0'
  s.summary        = 'Being in a channel, reported to iOS as an outgoing call'
  s.description    = 'A local Expo module that reports a step-in to CallKit as an outgoing call named Floor, so that it shows in Recents and other calls meet it as a call. See planning/task/integrate-with-callkit.md.'
  s.author         = ''
  s.homepage       = 'https://thefloor.rvanegas.co'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # For RTCAudioSession: CallKit's activation is forwarded to WebRTC natively.
  s.dependency 'WebRTC-SDK'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
